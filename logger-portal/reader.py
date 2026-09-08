#!/usr/bin/env python3
"""
Bayu 4-Gas reader — config-driven refactor of BAYU_SENSE_READER.py.

Same hardware + math as before, but every setting (MQTT, sample interval,
per-sensor sensitivity/zeros/thresholds) is loaded from config.yaml, which the
local settings portal edits. Each cycle it also writes the latest report to
config.status_file so the portal's Live view works without the cloud.

Run as the systemd unit named in config.service.name (default gas-monitor.service).
"""
import json
import os
import tempfile
import time
from pathlib import Path

import board
import busio
import adafruit_ads1x15.ads1015 as ADS1015
import adafruit_ads1x15.ads1115 as ADS1115
from adafruit_ads1x15.analog_in import AnalogIn
import paho.mqtt.client as mqtt

from config import load_config

# ---- hardware constants (fixed by the board) -----------------------
ADS1115_ADDR = 0x49
ADS1015_ADDR = 0x48
ADS_GAIN = 2 / 3
DIVIDER_RATIO = 2.0
READ_RETRIES = 3

# Which ADC + channels each sensor is wired to (hardware, not user config).
WIRING = {
    "co":  {"adc": "1115", "we": 0, "ae": 1},
    "ox":  {"adc": "1115", "we": 2, "ae": 3},
    "no2": {"adc": "1015", "we": 0, "ae": 1},
    "so2": {"adc": "1015", "we": 2, "ae": 3},
}
O3_THRESHOLDS = [54, 70]  # [GOOD, MODERATE] upper bounds, ppb


# ---- hardware setup ------------------------------------------------
def init_adcs():
    i2c = busio.I2C(board.SCL, board.SDA)
    return i2c, {
        "1115": ADS1115.ADS1115(i2c, address=ADS1115_ADDR, gain=ADS_GAIN),
        "1015": ADS1015.ADS1015(i2c, address=ADS1015_ADDR, gain=ADS_GAIN),
    }


def build_channels(adcs):
    ch = {}
    for key, w in WIRING.items():
        adc = adcs[w["adc"]]
        ch[key] = (AnalogIn(adc, w["we"]), AnalogIn(adc, w["ae"]))
    return ch


# ---- read + convert ------------------------------------------------
def read_pair(pair, avg_samples):
    we, ae = pair
    for _ in range(READ_RETRIES):
        try:
            op1 = sum(we.voltage for _ in range(avg_samples)) / avg_samples
            op2 = sum(ae.voltage for _ in range(avg_samples)) / avg_samples
            return op1 * DIVIDER_RATIO, op2 * DIVIDER_RATIO
        except OSError:
            time.sleep(0.15)
    return None, None


def convert_ppm(op1_v, op2_v, s):
    we_z = s["we_zero_v"] * DIVIDER_RATIO
    ae_z = s["ae_zero_v"] * DIVIDER_RATIO
    corrected = (op1_v - we_z) - (op2_v - ae_z)
    return (corrected * 1000.0) / s["sensitivity"]


def to_display_unit(ppm, unit):
    return ppm * 1000.0 if unit == "ppb" else ppm


def level_for(value, thresholds):
    if not thresholds:
        return None
    good, moderate = thresholds[0], thresholds[-1]
    if value <= good:
        return "GOOD"
    if value <= moderate:
        return "MODERATE"
    return "UNHEALTHY"


def write_status(status_file, report):
    """Atomically write the latest report for the portal to read."""
    try:
        path = Path(status_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent)
        with os.fdopen(fd, "w") as f:
            json.dump(report, f)
        os.replace(tmp, path)
    except Exception as e:
        print(f"status write failed: {e}")


# ---- MQTT ----------------------------------------------------------
def init_mqtt(m):
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                             client_id=m.get("client_id", "bayu-reader"))
    except (AttributeError, TypeError):
        client = mqtt.Client(client_id=m.get("client_id", "bayu-reader"))
    if m.get("username"):
        client.username_pw_set(m["username"], m.get("password", ""))
    if m.get("tls"):
        client.tls_set()
    client.on_connect = lambda *a: print("MQTT connected")
    client.reconnect_delay_set(min_delay=1, max_delay=120)
    client.connect_async(m["broker"], int(m.get("port", 8883)),
                         keepalive=int(m.get("keepalive", 60)))
    client.loop_start()
    return client


# ---- main loop -----------------------------------------------------
def main():
    cfg = load_config()
    m = cfg["mqtt"]
    sampling = cfg.get("sampling", {})
    sensors = cfg["sensors"]
    status_file = cfg.get("status_file", "/run/bayu/latest.json")
    gas_topic = f"{m['topic_prefix']}/gasTelemetry"

    i2c, adcs = init_adcs()
    channels = build_channels(adcs)
    client = init_mqtt(m)

    interval = float(sampling.get("interval_seconds", 20))
    avg_samples = int(sampling.get("average_samples", 16))

    try:
        while True:
            report = {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S")}
            raw_ppm = {}

            for key in ("co", "ox", "no2", "so2"):
                s = sensors[key]
                op1_v, op2_v = read_pair(channels[key], avg_samples)
                if op1_v is None:
                    raw_ppm[key] = None
                    report[key.upper()] = {"error": "read failed"}
                    try:
                        i2c, adcs = init_adcs()
                        channels = build_channels(adcs)
                    except Exception as e:
                        print(f"reinit failed: {e}")
                    continue
                ppm = convert_ppm(op1_v, op2_v, s)
                raw_ppm[key] = ppm
                value = to_display_unit(ppm, s["unit"])
                entry = {
                    "OP1_V": round(op1_v, 4),
                    "OP2_V": round(op2_v, 4),
                    f"{key.upper()}_{s['unit']}": round(value, 3),
                }
                lvl = level_for(value, s.get("thresholds"))
                if lvl:
                    entry["level"] = lvl
                report[key.upper()] = entry

            if raw_ppm.get("ox") is not None and raw_ppm.get("no2") is not None:
                o3_ppb = max(0.0, raw_ppm["ox"] - raw_ppm["no2"]) * 1000.0
                report["O3"] = {
                    "O3_ppb": round(o3_ppb, 3),
                    "level": level_for(o3_ppb, O3_THRESHOLDS),
                    "note": "derived = OX - NO2",
                }

            payload = json.dumps(report)
            write_status(status_file, report)
            try:
                client.publish(gas_topic, payload,
                               qos=int(m.get("qos", 1)), retain=bool(m.get("retain")))
            except Exception as e:
                print(f"publish failed: {e}")

            time.sleep(interval)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
