"""
4-Gas Air Quality Monitor  —  CO, SO2, NO2, O3(derived)
Raspberry Pi 4B + 2x Alphasense ISB-fed ADCs  ->  MQTT (HiveMQ)

I2C topology (shared bus, external 4.7k pull-ups on SDA/SCL to 3.3V):
  ADS1115 @ 0x49   (ADDR -> 3.3V, 16-bit)
      A0/A1  ->  CO-B4     (OP1 / OP2)
      A2/A3  ->  OX-B431   (OP1 / OP2)
  ADS1015 @ 0x48   (ADDR -> GND, 12-bit)
      A0/A1  ->  NO2-B43F  (OP1 / OP2)
      A2/A3  ->  SO2-B4    (OP1 / OP2)

O3 is derived:  O3 = OX - NO2   (Alphasense method)

I2C runs at 50 kHz (dtoverlay=i2c1,baudrate=50000 in /boot/firmware/config.txt)
to avoid the Pi 4 clock-stretching bug that corrupts ADS1115 reads at 100 kHz.

Run as systemd service `gas-monitor.service`.

CONFIG: thresholds, sampling and MQTT settings are loaded from the logger
portal's config.yaml (/home/adminpi4/logger-portal/config.yaml, override with
BAYU_CONFIG). Calibration comes from the portal's three levels
(logger-portal/calibration/: factory -> manufacturer -> user, see
calibration.py), with y = m*x + c corrections on OP1, OP2 and the output.
Both are re-checked every cycle, so a portal change applies within one cycle;
MQTT is read at start-up. The SENSORS / MQTT values written below are
FALLBACKS only, used if config.yaml / calibration/ are missing or invalid.

Every reading is also saved on the Pi (logger-portal/data/bayu.db) for the
portal's History and Calibration tabs, and carries "cal": the id of the
calibration it was calculated with. While a calibration runs in the portal
(calibration/session.json), readings are taken every 5 s instead of 20 s.
"""

import os
import sys
import time
import json

try:
    import yaml
except ImportError:          # sudo apt install python3-yaml
    yaml = None

import board
import busio
import adafruit_ads1x15.ads1015 as ADS1015
import adafruit_ads1x15.ads1115 as ADS1115
from adafruit_ads1x15.analog_in import AnalogIn
import paho.mqtt.client as mqtt


# ═══════════════════════════════════════════════════════════════════════
# HARDWARE CONSTANTS
# ═══════════════════════════════════════════════════════════════════════

ADS1115_ADDR = 0x49
ADS1015_ADDR = 0x48

ADS_GAIN = 2 / 3          # ±6.144V range
DIVIDER_RATIO = 2.0       # 2x 4.7k divider on each analog line

# Read behaviour
READ_RETRIES = 3
AVG_SAMPLES = 16          # samples averaged per channel read (noise smoothing)
SAMPLE_INTERVAL = 20.0    # seconds between report cycles


# ═══════════════════════════════════════════════════════════════════════
# MQTT  ——  HiveMQ
# ─────────────────────────────────────────────────────────────────────────
#  The live settings (broker, port, TLS, username, password, topic) come from
#  the portal's config.yaml -> mqtt:. Keep credentials there, not in this file:
#  this file is in a public repository.
#
#  A) HiveMQ Cloud (your own hosted cluster — recommended, secure):
#       broker = "xxxxxxxx.s1.eu.hivemq.cloud", port 8883, tls: true
#  B) HiveMQ public test broker (open, NO security — testing only):
#       broker = "broker.hivemq.com", port 1883, tls: false
#     ⚠️  Anyone can read/write this broker. Never send real data here.
# ═══════════════════════════════════════════════════════════════════════

MQTT_BROKER    = ""                               # fallback only; set mqtt.broker in config.yaml
MQTT_PORT      = 8883                             # 8883 = TLS (Cloud), 1883 = plain (public)
MQTT_USE_TLS   = True                             # True for Cloud, False for public broker
MQTT_TOPIC     = "v1/device/demo/gasTelemetry"    # HiveMQ Cloud default topic for device telemetry
MQTT_CLIENT_ID = "gas-monitor-pi4"
MQTT_USER      = ""                               # fallback only; set mqtt.username in config.yaml
MQTT_PASS      = ""                               # fallback only; set mqtt.password in config.yaml
MQTT_QOS       = 2                                # 1 = at-least-once (good over the internet)
MQTT_RETAIN    = True                             # dashboards connecting later see last reading


# ═══════════════════════════════════════════════════════════════════════
# SENSOR CONFIGURATION
#  we_sens : signed WE sensitivity mV/ppm (Alphasense ISB manual, Table 2)
#  we/ae_zero_v : field-calibrated zeros (raw ADC volts, pre-divider)
#  FALLBACK ONLY — live values come from the portal's calibration levels
# ═══════════════════════════════════════════════════════════════════════

SENSORS = {
    "CO": {
        "name": "CO-B4", "unit": "ppm", "adc": "1115", "addr": ADS1115_ADDR,
        "we_channel": 0, "ae_channel": 1,
        "we_sens": 336.0, "we_zero_v": 0.3262, "ae_zero_v": 0.2776,
        "thresholds": [(9, "GOOD"), (35, "MODERATE"), (None, "UNHEALTHY")],
    },
    "OX": {
        "name": "OX-B431", "unit": "ppb", "adc": "1115", "addr": ADS1115_ADDR,
        "we_channel": 2, "ae_channel": 3,
        "we_sens": -216.0, "we_zero_v": 0.2032, "ae_zero_v": 0.2162,
        "thresholds": None,     # OX itself not levelled; feeds O3
    },
    "NO2": {
        "name": "NO2-B43F", "unit": "ppb", "adc": "1015", "addr": ADS1015_ADDR,
        "we_channel": 0, "ae_channel": 1,
        "we_sens": -165.0, "we_zero_v": 0.1924, "ae_zero_v": 0.2110,
        "thresholds": [(53, "GOOD"), (100, "MODERATE"), (None, "UNHEALTHY")],
    },
    "SO2": {
        "name": "SO2-B4", "unit": "ppb", "adc": "1015", "addr": ADS1015_ADDR,
        "we_channel": 2, "ae_channel": 3,
        "we_sens": 240.0, "we_zero_v": 0.3666, "ae_zero_v": 0.3419,
        "thresholds": [(35, "GOOD"), (75, "MODERATE"), (None, "UNHEALTHY")],
    },
}

O3_THRESHOLDS = [(54, "GOOD"), (70, "MODERATE"), (None, "UNHEALTHY")]


# ═══════════════════════════════════════════════════════════════════════
# PORTAL CONFIG  —  logger-portal/config.yaml is the source of truth
# ═══════════════════════════════════════════════════════════════════════

CONFIG_PATH = os.environ.get("BAYU_CONFIG",
                             "/home/adminpi4/logger-portal/config.yaml")
CONFIG_KEYS = {"CO": "co", "OX": "ox", "NO2": "no2", "SO2": "so2"}
_config_mtime = None

# The portal's calibration levels and local storage live next to config.yaml.
PORTAL_DIR = os.path.dirname(os.path.abspath(CONFIG_PATH))
if PORTAL_DIR not in sys.path:
    sys.path.insert(0, PORTAL_DIR)
try:
    import calibration as calib
except Exception as e:      # portal not installed / too old: original behaviour
    calib = None
    print(f"⚠️  Calibration levels unavailable ({e}) — using config.yaml values")
try:
    from storage import open_store
except Exception as e:
    open_store = None
    print(f"⚠️  Local storage unavailable ({e}) — readings are not saved on the Pi")

CAL = None                  # calibration.Calibration in use (None = config.yaml values)
_cal_mtimes = None


def read_config():
    if yaml is None:
        raise RuntimeError("PyYAML not installed (sudo apt install python3-yaml)")
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _thresholds(values):
    """config [GOOD, MODERATE] upper bounds -> this script's tuple format."""
    if not values:
        return None
    vals = [float(v) for v in values]
    return [(vals[0], "GOOD"), (vals[-1], "MODERATE"), (None, "UNHEALTHY")]


def reload_calibration(force=False):
    """Apply thresholds + sampling (and, before the calibration levels are set
    up, sensitivity/zeros) from config.yaml when the file changes. Everything
    is validated first; on any problem the values currently in use are kept
    (never half-applied)."""
    global _config_mtime, AVG_SAMPLES, SAMPLE_INTERVAL
    try:
        mtime = os.stat(CONFIG_PATH).st_mtime
    except OSError as e:
        if force:
            print(f"⚠️  Config not found ({e}) — using built-in calibration")
        return
    if not force and mtime == _config_mtime:
        return
    _config_mtime = mtime

    try:
        cfg = read_config()
        sensors = cfg.get("sensors") or {}
        updates = {}
        for name, key in CONFIG_KEYS.items():
            s = sensors.get(key) or {}
            upd = {}
            if s.get("sensitivity") is not None:
                sens = float(s["sensitivity"])
                if sens == 0:
                    raise ValueError(f"{key}.sensitivity is 0")
                upd["we_sens"] = sens
            for field in ("we_zero_v", "ae_zero_v"):
                if s.get(field) is not None:
                    upd[field] = float(s[field])
            if "thresholds" in s:
                upd["thresholds"] = _thresholds(s["thresholds"])
            updates[name] = upd
        sampling = cfg.get("sampling") or {}
        interval = float(sampling.get("interval_seconds", SAMPLE_INTERVAL))
        avg = int(sampling.get("average_samples", AVG_SAMPLES))
        if interval <= 0 or avg < 1:
            raise ValueError("sampling values must be > 0")
    except Exception as e:
        print(f"⚠️  Config reload failed ({e}) — keeping current calibration")
        return

    for name, upd in updates.items():
        SENSORS[name].update(upd)
    SAMPLE_INTERVAL, AVG_SAMPLES = interval, avg
    print(f"Config loaded from {CONFIG_PATH}")
    if CAL is None:
        for name, s in SENSORS.items():
            print(f"  {name:4s} sens={s['we_sens']:+.1f}  "
                  f"we_zero_v={s['we_zero_v']:.4f}  ae_zero_v={s['ae_zero_v']:.4f}")
    print(f"  interval={SAMPLE_INTERVAL:g}s  avg_samples={AVG_SAMPLES}")


def reload_levels(force=False):
    """Load the portal's calibration levels when any level file changes.
    Until `python3 calibration.py init` has been run on the Pi, the
    config.yaml values keep being used."""
    global CAL, _cal_mtimes
    if calib is None:
        return
    m = calib.mtimes()
    if not force and m == _cal_mtimes:
        return
    _cal_mtimes = m
    if not calib.level_path("manufacturer").exists():
        if force:
            print("ℹ️  Calibration levels not set up yet "
                  f"(run: python3 {os.path.join(PORTAL_DIR, 'calibration.py')} init) — using config.yaml values")
        CAL = None
        return
    try:
        new = calib.load()
    except Exception as e:
        print(f"⚠️  Calibration reload failed ({e}) — keeping current values")
        return
    CAL = new
    for err in new.errors:
        print(f"⚠️  {err}")
    print(f"Calibration {new.version} loaded (user -> manufacturer -> factory)")
    for gas in calib.ALL:
        print(f"  {calib.NAME[gas]:4s} " + "  ".join(f"{g}={v}" for g, v in new.params(gas).items()))


def current_interval():
    """5 s while the portal runs a calibration, otherwise the normal interval.
    The portal keeps the session file fresh; if it stops, this times out."""
    if calib is not None:
        try:
            with open(calib.session_path(), encoding="utf-8") as f:
                s = json.load(f)
            if time.time() < float(s.get("fast_until", 0)):
                return max(1.0, float(s.get("fast_interval", 5)))
        except (OSError, ValueError, TypeError):
            pass
    return SAMPLE_INTERVAL


def load_mqtt_settings():
    """MQTT settings from config.yaml (read once at start-up; the portal
    restarts this service when MQTT settings are saved). Validated first;
    on any problem the built-in MQTT settings are kept (never crashes)."""
    try:
        m = read_config().get("mqtt") or {}
        if not m.get("broker"):
            raise ValueError("no mqtt.broker")
        port = int(m["port"]) if m.get("port") is not None else MQTT_PORT
        if not 1 <= port <= 65535:
            raise ValueError(f"bad mqtt.port {m.get('port')!r}")
        qos = int(m["qos"]) if m.get("qos") is not None else MQTT_QOS
        if qos not in (0, 1, 2):
            raise ValueError(f"bad mqtt.qos {m.get('qos')!r}")
        prefix = m.get("topic_prefix")
        new = {
            "MQTT_BROKER": str(m["broker"]),
            "MQTT_PORT": port,
            "MQTT_USE_TLS": bool(m.get("tls", MQTT_USE_TLS)),
            "MQTT_TOPIC": f"{prefix}/gasTelemetry" if prefix else MQTT_TOPIC,
            "MQTT_CLIENT_ID": m.get("client_id") or MQTT_CLIENT_ID,
            "MQTT_USER": m.get("username") or "",
            "MQTT_PASS": m.get("password") or "",
            "MQTT_QOS": qos,
            "MQTT_RETAIN": bool(m.get("retain", MQTT_RETAIN)),
        }
    except Exception as e:
        print(f"⚠️  MQTT config not used ({e}) — using built-in MQTT settings")
        return
    globals().update(new)
    print(f"MQTT from config: {MQTT_BROKER}:{MQTT_PORT} "
          f"tls={MQTT_USE_TLS} topic={MQTT_TOPIC}")


# ═══════════════════════════════════════════════════════════════════════
# HARDWARE SETUP
# ═══════════════════════════════════════════════════════════════════════

def init_adcs():
    i2c = busio.I2C(board.SCL, board.SDA)
    adcs = {
        "1115": ADS1115.ADS1115(i2c, address=ADS1115_ADDR, gain=ADS_GAIN),
        "1015": ADS1015.ADS1015(i2c, address=ADS1015_ADDR, gain=ADS_GAIN),
    }
    return i2c, adcs


def build_channels(adcs):
    channels = {}
    for name, cfg in SENSORS.items():
        adc = adcs[cfg["adc"]]
        we = AnalogIn(adc, cfg["we_channel"])
        ae = AnalogIn(adc, cfg["ae_channel"])
        channels[name] = (we, ae)
    return channels


# ═══════════════════════════════════════════════════════════════════════
# READ + CONVERT
# ═══════════════════════════════════════════════════════════════════════

def read_pair(pair):
    we, ae = pair
    for attempt in range(1, READ_RETRIES + 1):
        try:
            op1 = sum(we.voltage for _ in range(AVG_SAMPLES)) / AVG_SAMPLES
            op2 = sum(ae.voltage for _ in range(AVG_SAMPLES)) / AVG_SAMPLES
            return op1 * DIVIDER_RATIO, op2 * DIVIDER_RATIO
        except OSError as e:
            print(f"  I2C error (attempt {attempt}/{READ_RETRIES}): {e}")
            time.sleep(0.15)
    return None, None


def convert_ppm(op1_v, op2_v, cfg):
    """Zero each electrode, difference WE-AE, divide by signed sensitivity.
    Zeros are raw ADC volts, scaled by DIVIDER_RATIO to match op voltages.
    (Used only until the calibration levels are set up.)"""
    we_z = cfg["we_zero_v"] * DIVIDER_RATIO
    ae_z = cfg["ae_zero_v"] * DIVIDER_RATIO
    corrected_v = (op1_v - we_z) - (op2_v - ae_z)
    return (corrected_v * 1000.0) / cfg["we_sens"]


def to_display_unit(ppm, unit):
    return ppm * 1000.0 if unit == "ppb" else ppm


def gas_value(name, cfg, op1_v, op2_v):
    """Reading in the gas's display unit (ppm for CO, ppb otherwise)."""
    if CAL is not None:
        key = CONFIG_KEYS[name]
        return calib.compute(key, CAL.params(key), op1_v, op2_v)["value"]
    return to_display_unit(convert_ppm(op1_v, op2_v, cfg), cfg["unit"])


def level_for(value, thresholds):
    if not thresholds:
        return None
    for limit, label in thresholds:
        if limit is None or value <= limit:
            return label
    return None


# ═══════════════════════════════════════════════════════════════════════
# I2C HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════

def scan_bus(i2c, expected=(ADS1015_ADDR, ADS1115_ADDR)):
    present = []
    if i2c.try_lock():
        try:
            found = i2c.scan()
        finally:
            i2c.unlock()
        present = [a for a in expected if a in found]
    return present


# ═══════════════════════════════════════════════════════════════════════
# MQTT
# ═══════════════════════════════════════════════════════════════════════

def init_mqtt():
    """Connect to HiveMQ in the background. Non-blocking: if the broker is
    unreachable, paho keeps retrying while sensor readings continue."""
    if not MQTT_BROKER:
        print("⚠️  No MQTT broker configured (config.yaml mqtt.broker) — readings are only saved on the Pi")
        return None
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                             client_id=MQTT_CLIENT_ID)
    except (AttributeError, TypeError):
        client = mqtt.Client(client_id=MQTT_CLIENT_ID)   # paho-mqtt < 2.0

    if MQTT_USER:
        client.username_pw_set(MQTT_USER, MQTT_PASS)

    if MQTT_USE_TLS:
        client.tls_set()          # system CA certs; HiveMQ Cloud uses a public CA

    client.on_connect = lambda c, u, f, rc, *a: print(f"MQTT connected (rc={rc})")
    client.on_disconnect = lambda c, u, *a: print("MQTT disconnected, retrying...")

    client.reconnect_delay_set(min_delay=1, max_delay=120)
    client.connect_async(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()
    return client


def init_store():
    if open_store is None:
        return None
    try:
        store = open_store(read_config())
        if store is not None:
            print(f"Saving readings on the Pi: {store.path}")
        return store
    except Exception as e:
        print(f"⚠️  Local storage unavailable ({e}) — readings are not saved on the Pi")
        return None


# ═══════════════════════════════════════════════════════════════════════
# MAIN LOOP
# ═══════════════════════════════════════════════════════════════════════

def main():
    print("4-Gas Monitor (CO, SO2, NO2, O3)  ->  HiveMQ")
    print("ADS1015 @ 0x48  |  ADS1115 @ 0x49")
    print("=" * 55)

    reload_levels(force=True)
    reload_calibration(force=True)
    load_mqtt_settings()

    i2c, adcs = init_adcs()
    channels = build_channels(adcs)
    mqtt_client = init_mqtt()
    store = init_store()

    try:
        while True:
            reload_levels()               # picks up a calibration within one cycle
            reload_calibration()          # thresholds + sampling from config.yaml
            now = time.time()
            report = {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now))}
            values = {}                   # final readings in display units

            for name, cfg in SENSORS.items():
                op1_v, op2_v = read_pair(channels[name])

                if op1_v is None:
                    addr = cfg.get("addr")
                    present = scan_bus(i2c)
                    dropped = addr is not None and addr not in present
                    seen = ", ".join(f"0x{a:02x}" for a in present) or "none"
                    state = "DEVICE MISSING" if dropped else "ACK ok — transient NAK"
                    print(f"⚠️  {name}: read failed on 0x{addr:02x} "
                          f"[{state}]; bus now sees: {seen}")
                    try:
                        i2c, adcs = init_adcs()
                        channels = build_channels(adcs)
                    except Exception as e:
                        print(f"❌  Reinit failed: {e}")
                    values[name] = None
                    continue

                value = gas_value(name, cfg, op1_v, op2_v)
                values[name] = value

                entry = {
                    "OP1_V": round(op1_v, 4),
                    "OP2_V": round(op2_v, 4),
                    f"{name}_{cfg['unit']}": round(value, 3),
                }
                lvl = level_for(value, cfg["thresholds"])
                if lvl is not None:
                    entry["level"] = lvl
                report[name] = entry

            if values.get("OX") is not None and values.get("NO2") is not None:
                if CAL is not None:
                    o3_ppb = calib.compute_o3(CAL.params("o3"), values["OX"], values["NO2"])
                else:
                    o3_ppb = max(0.0, values["OX"] - values["NO2"])   # both ppb
                report["O3"] = {
                    "O3_ppb": round(o3_ppb, 3),
                    "level":  level_for(o3_ppb, O3_THRESHOLDS),
                    "note":   "derived = OX − NO2",
                }
            if CAL is not None:
                report["cal"] = CAL.version   # which calibration produced these numbers

            payload = json.dumps(report)          # compact, for MQTT
            print(json.dumps(report, indent=2))    # pretty, for the journal
            print("-" * 55)

            if store is not None:
                try:
                    store.insert("gas", int(now), report)
                except Exception as e:
                    print(f"⚠️  Local save failed: {e}")

            if mqtt_client is not None:
                try:
                    mqtt_client.publish(MQTT_TOPIC, payload,
                                        qos=MQTT_QOS, retain=MQTT_RETAIN)
                except Exception as e:
                    print(f"MQTT publish failed: {e}")

            time.sleep(current_interval())

    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        if mqtt_client is not None:
            mqtt_client.loop_stop()
            mqtt_client.disconnect()


if __name__ == "__main__":
    main()
