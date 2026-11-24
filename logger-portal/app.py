"""
Bayu Logger — local settings portal (FastAPI).

Serves a single-page UI plus a small REST/WebSocket API to configure and
maintain ONE Raspberry Pi logger from a browser on the same network.

Design notes
------------
* All device settings live in config.yaml; this API only reads/writes that
  file and (optionally) restarts the reader service to apply changes.
* Every hardware/OS call is wrapped so the app still runs on a laptop for
  development — it just reports "unavailable" instead of crashing.
* Readings are kept in a local SQLite history (storage.py). The reader saves
  gas; this app saves particulate + weather from its MQTT subscriber, prunes
  old rows, and serves the History tab (/api/history/*).
"""
import asyncio
import json
import os
import secrets
import shutil
import subprocess
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, status
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles

from config import deep_merge, load_config, save_config
from storage import STREAMS, csv_chunks, json_path, open_store, reading_ts, storage_settings

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Bayu Logger Portal", version="1.0.0")
security = HTTPBasic(auto_error=False)


# --------------------------------------------------------------------------
# Auth — HTTP Basic against config.portal. Empty password disables it (dev).
# --------------------------------------------------------------------------
def require_admin(creds: HTTPBasicCredentials = Depends(security)):
    portal = load_config().get("portal", {})
    want_user = portal.get("username") or ""
    want_pass = portal.get("password") or ""
    if not want_pass:
        return  # auth disabled
    ok = (
        creds is not None
        and secrets.compare_digest(creds.username, want_user)
        and secrets.compare_digest(creds.password, want_pass)
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


# --------------------------------------------------------------------------
# Small OS/hardware helpers (all fail soft)
# --------------------------------------------------------------------------
def _run(cmd: list[str], timeout: int = 10) -> tuple[int, str]:
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False
        )
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except FileNotFoundError:
        return 127, f"{cmd[0]}: not found"
    except subprocess.TimeoutExpired:
        return 124, "timeout"


def _rc_ok(rc):
    """paho-mqtt v2 passes a ReasonCode to on_connect; v1 passes an int."""
    try:
        return int(getattr(rc, "value", rc)) == 0
    except Exception:
        return False


def cpu_temp_c():
    try:
        raw = Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()
        return round(int(raw) / 1000, 1)
    except Exception:
        return None


def uptime_seconds():
    try:
        return int(float(Path("/proc/uptime").read_text().split()[0]))
    except Exception:
        return None


def disk_usage():
    try:
        u = shutil.disk_usage("/")
        return {"total_gb": round(u.total / 1e9, 1), "free_gb": round(u.free / 1e9, 1)}
    except Exception:
        return None


def service_active(name: str) -> str:
    code, out = _run(["systemctl", "is-active", name])
    return out.strip() or ("active" if code == 0 else "unknown")


_i2c_cache = {"t": 0.0, "data": {"available": False, "addresses": []}}


def i2c_scan(bus: int = 1, max_age: float = 30):
    """Detected I2C addresses via i2cdetect. Cached for `max_age` seconds so we
    don't spawn a subprocess (and probe the reader's bus) on every request."""
    now = time.time()
    if _i2c_cache["t"] and now - _i2c_cache["t"] < max_age:
        return _i2c_cache["data"]
    code, out = _run(["i2cdetect", "-y", str(bus)])
    if code != 0:
        result = {"available": False, "detail": out.strip(), "addresses": []}
    else:
        addrs = []
        for line in out.splitlines()[1:]:
            for tok in line.split()[1:]:
                if tok not in ("--", "UU"):
                    addrs.append("0x" + tok)
        result = {"available": True, "addresses": addrs}
    _i2c_cache["t"] = now
    _i2c_cache["data"] = result
    return result


def read_status_file():
    path = load_config().get("status_file", "/run/bayu/latest.json")
    try:
        p = Path(path)
        data = json.loads(p.read_text())
        data["_age_s"] = round(time.time() - p.stat().st_mtime, 1)
        return data
    except Exception:
        return None


def mqtt_test(host, port, tls, username, password, timeout=8):
    try:
        import paho.mqtt.client as mqtt
    except Exception:
        return {"ok": False, "detail": "paho-mqtt not installed"}
    result = {"ok": False, "detail": "no response"}
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    except (AttributeError, TypeError):
        client = mqtt.Client()
    if username:
        client.username_pw_set(username, password or "")
    if tls:
        client.tls_set()
    connected = {"rc": None}

    def on_connect(c, u, f, rc, *a):
        connected["rc"] = 0 if _rc_ok(rc) else 1

    client.on_connect = on_connect
    try:
        client.connect(host, int(port), keepalive=timeout)
        client.loop_start()
        deadline = time.time() + timeout
        while connected["rc"] is None and time.time() < deadline:
            time.sleep(0.1)
        client.loop_stop()
        client.disconnect()
        if connected["rc"] == 0:
            result = {"ok": True, "detail": "Connected"}
        elif connected["rc"] is None:
            result = {"ok": False, "detail": "Connection timed out"}
        else:
            result = {"ok": False, "detail": f"Refused (rc={connected['rc']})"}
    except Exception as e:
        result = {"ok": False, "detail": str(e)}
    return result


# --------------------------------------------------------------------------
# Node-RED (same Pi): hosts the Aedes MQTT broker AND the particulate + weather
# collection flows. The gas reader is the separate Python service.
# --------------------------------------------------------------------------
def _http_json(method, url, token=None, body=None, timeout=8, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode()
        return r.status, (json.loads(raw) if raw.strip() else None)


def _nodered():
    nr = load_config().get("nodered", {})
    return (
        nr.get("service", "nodered.service"),
        nr.get("admin_url", "http://127.0.0.1:1880").rstrip("/"),
        nr.get("admin_token") or None,
    )


def _get_flows(url, token):
    _, flows = _http_json("GET", f"{url}/flows", token)
    if isinstance(flows, dict) and "flows" in flows:  # v2 shape
        return flows["flows"]
    return flows or []


def _find_aedes(flows):
    for n in flows:
        if isinstance(n, dict) and str(n.get("type", "")).startswith("aedes"):
            return n
    return None


def _find_broker(flows):
    """The broker connection the mqtt in/out nodes use.
    Prefer the 'mqtt-broker' client-config node; fall back to an Aedes node."""
    for n in flows:
        if isinstance(n, dict) and n.get("type") == "mqtt-broker":
            return n
    return _find_aedes(flows)


_AEDES_SKIP = {"id", "type", "z", "x", "y", "wires", "g", "name"}


def _aedes_props(node):
    """Editable scalar settings of the Aedes broker node (version-agnostic)."""
    return {
        k: v
        for k, v in node.items()
        if k not in _AEDES_SKIP and isinstance(v, (str, int, float, bool))
    }


# --------------------------------------------------------------------------
# Live view — subscribe to the LOCAL broker so the portal shows all three
# streams: gas (Python reader) + particulate + weather (Node-RED flows).
# --------------------------------------------------------------------------
LIVE = {"gas": None, "particulate": None, "weather": None, "connected": False}
_live_client = None


def _effective_live_broker():
    """Resolve where the portal subscribes for live data. A blank host means
    'reuse the gas reader's broker' (mqtt config); otherwise use the override."""
    cfg = load_config()
    lb = cfg.get("live_broker", {}) or {}
    m = cfg.get("mqtt", {}) or {}
    if lb.get("host"):
        return {
            "host": lb.get("host"),
            "port": int(lb.get("port") or 8883),
            "tls": bool(lb.get("tls", True)),
            "username": lb.get("username") or None,
            "password": lb.get("password") or None,
            "topic_prefix": lb.get("topic_prefix") or m.get("topic_prefix", "v1/device/demo"),
            "source": "override",
        }
    return {
        "host": m.get("broker"),
        "port": int(m.get("port") or 8883),
        "tls": bool(m.get("tls", True)),
        "username": m.get("username") or None,
        "password": m.get("password") or None,
        "topic_prefix": m.get("topic_prefix", "v1/device/demo"),
        "source": "reader",
    }


def _stop_live_subscriber():
    global _live_client
    if _live_client is not None:
        try:
            _live_client.loop_stop()
            _live_client.disconnect()
        except Exception:
            pass
        _live_client = None


def _start_live_subscriber():
    global _live_client
    _stop_live_subscriber()
    LIVE["connected"] = False
    try:
        import paho.mqtt.client as mqtt
    except Exception:
        return
    p = _effective_live_broker()
    if not p["host"]:
        return
    prefix = p["topic_prefix"]
    topics = {
        f"{prefix}/gasTelemetry": "gas",
        f"{prefix}/particulateTelemetry": "particulate",
        f"{prefix}/weatherStation": "weather",
    }
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    except (AttributeError, TypeError):
        client = mqtt.Client()
    if p["username"]:
        client.username_pw_set(p["username"], p["password"] or "")
    if p["tls"]:
        try:
            client.tls_set()
        except Exception:
            pass

    def on_connect(c, u, f, rc, *a):
        LIVE["connected"] = _rc_ok(rc)
        for t in topics:
            c.subscribe(t)

    def on_disconnect(c, u, *a):
        LIVE["connected"] = False

    def on_message(c, u, msg):
        key = topics.get(msg.topic)
        if not key:
            return
        try:
            data = json.loads(msg.payload.decode())
        except Exception:
            return
        now = time.time()
        LIVE[key] = {"data": data, "t": now}
        # A retained message is an old reading the broker replays on (re)subscribe
        # — show it live, but don't store it again as a new reading.
        if not msg.retain and isinstance(data, dict):
            _record(key, data, now)

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    try:
        client.connect_async(p["host"], p["port"], keepalive=60)
        client.loop_start()
        _live_client = client
    except Exception:
        _live_client = None


# --------------------------------------------------------------------------
# Local history (SQLite) — writes from the live subscriber + hourly pruning
# --------------------------------------------------------------------------
STORE_STATE = {"error": None}  # last write/prune error, shown on the Overview


def _record(stream, data, received):
    """Save one MQTT reading. Gas is normally saved by the reader itself; the
    copy arriving over MQTT has the same timestamp and is ignored as a duplicate,
    so this only fills in gas when the reader isn't writing locally."""
    try:
        store = open_store(load_config())
        if store is not None:
            store.insert(stream, reading_ts(data, received), data)
            STORE_STATE["error"] = None
    except Exception as e:
        STORE_STATE["error"] = f"write failed: {e}"


def _housekeeping():
    """Create the database on boot, then drop readings past retention hourly."""
    while True:
        try:
            cfg = load_config()
            store = open_store(cfg)
            if store is not None:
                store.prune(storage_settings(cfg)["retention_days"])
        except Exception as e:
            STORE_STATE["error"] = f"prune failed: {e}"
        time.sleep(3600)


def storage_status():
    """Small, cheap summary for /api/status (polled every few seconds)."""
    cfg = load_config()
    if not storage_settings(cfg)["enabled"]:
        return {"enabled": False}
    try:
        store = open_store(cfg)
        now = time.time()
        return {
            "enabled": True,
            "ok": STORE_STATE["error"] is None,
            "error": STORE_STATE["error"],
            "size_bytes": store.size_bytes(),
            "last_saved_age_s": {
                k: (round(now - v) if v else None) for k, v in store.last_ts().items()
            },
        }
    except Exception as e:
        return {"enabled": True, "ok": False, "error": str(e)}


@app.on_event("startup")
def _on_startup():
    _start_live_subscriber()
    threading.Thread(target=_housekeeping, name="bayu-storage", daemon=True).start()


# --------------------------------------------------------------------------
# Overview extras: memory, per-stream freshness, network, Pi power/throttle
# --------------------------------------------------------------------------
_net_cache = {"t": 0.0, "data": {"ip": None, "hostname": None, "ssid": None, "signal": None}}


def mem_usage():
    try:
        info = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            parts = line.split(":")
            if len(parts) == 2:
                info[parts[0]] = int(parts[1].strip().split()[0])  # kB
        total = info.get("MemTotal", 0)
        avail = info.get("MemAvailable", info.get("MemFree", 0))
        used = total - avail
        return {
            "total_gb": round(total / 1e6, 2),
            "used_gb": round(used / 1e6, 2),
            "percent": round(used / total * 100) if total else None,
        }
    except Exception:
        return None


def stream_freshness():
    """Seconds since the last message on each live stream (None = never)."""
    now = time.time()
    out = {}
    for k in ("gas", "particulate", "weather"):
        v = LIVE.get(k)
        out[k] = round(now - v["t"], 1) if isinstance(v, dict) and v.get("t") else None
    return out


def network_info(max_age: float = 30):
    now = time.time()
    if _net_cache["t"] and now - _net_cache["t"] < max_age:
        return _net_cache["data"]
    out = {"ip": None, "hostname": None, "ssid": None, "signal": None}
    try:
        import socket

        out["hostname"] = socket.gethostname()
    except Exception:
        pass
    code, o = _run(["hostname", "-I"])
    if code == 0 and o.strip():
        out["ip"] = o.strip().split()[0]
    code, o = _run(["iwgetid", "-r"])
    if code == 0 and o.strip():
        out["ssid"] = o.strip()
    try:
        lines = Path("/proc/net/wireless").read_text().splitlines()
        if len(lines) >= 3:
            out["signal"] = lines[2].split()[2].rstrip(".") + "/70"
    except Exception:
        pass
    _net_cache["t"] = now
    _net_cache["data"] = out
    return out


_nr_reach_cache = {"t": 0.0, "ok": False}


def nodered_reachable(max_age: float = 10):
    """Is Node-RED actually responding on its Admin API (regardless of how it
    was started)? A 401 still counts as up — the server answered."""
    now = time.time()
    if _nr_reach_cache["t"] and now - _nr_reach_cache["t"] < max_age:
        return _nr_reach_cache["ok"]
    _, url, token = _nodered()
    ok = False
    try:
        code, _ = _http_json("GET", f"{url}/settings", token, timeout=3)
        ok = 200 <= code < 500
    except urllib.error.HTTPError:
        ok = True  # responded (e.g. 401) -> it's up
    except Exception:
        ok = False
    _nr_reach_cache["t"] = now
    _nr_reach_cache["ok"] = ok
    return ok


def pi_power():
    """Raspberry Pi undervoltage / throttling flags via vcgencmd."""
    code, o = _run(["vcgencmd", "get_throttled"])
    if code != 0 or "=" not in o:
        return None
    try:
        val = int(o.strip().split("=")[1], 16)
    except Exception:
        return None
    return {
        "under_voltage": bool(val & 0x1),
        "throttled": bool(val & 0x4),
        "under_voltage_occurred": bool(val & 0x10000),
        "throttled_occurred": bool(val & 0x40000),
        "raw": hex(val),
    }


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------
@app.get("/api/status")
def api_status():
    cfg = load_config()
    svc = cfg.get("service", {}).get("name", "")
    nr_svc = cfg.get("nodered", {}).get("service", "nodered.service")
    latest = read_status_file()
    return {
        "device": cfg.get("device", {}),
        "uptime_s": uptime_seconds(),
        "cpu_temp_c": cpu_temp_c(),
        "disk": disk_usage(),
        "memory": mem_usage(),
        "service": {"name": svc, "state": service_active(svc) if svc else "n/a"},
        "nodered": {
            "state": service_active(nr_svc),
            "reachable": nodered_reachable(),
            "broker_connected": LIVE.get("connected", False),
        },
        "streams": stream_freshness(),
        "network": network_info(),
        "power": pi_power(),
        "i2c": i2c_scan(),
        "reader_last_report": latest,  # None if the reader isn't writing yet
        "storage": storage_status(),
    }


@app.get("/api/config", dependencies=[Depends(require_admin)])
def api_get_config():
    cfg = load_config()
    cfg.get("mqtt", {}).pop("password", None)  # never send secrets to the client
    cfg.get("portal", {}).pop("password", None)
    cfg.get("live_broker", {}).pop("password", None)
    return cfg


@app.put("/api/config", dependencies=[Depends(require_admin)])
async def api_put_config(patch: dict, restart: bool = False):
    """Merge the incoming partial config, persist, optionally restart reader."""
    merged = deep_merge(load_config(), patch)
    save_config(merged)
    restarted = None
    if restart:
        svc = merged.get("service", {}).get("name")
        if svc:
            code, out = _run(["sudo", "systemctl", "restart", svc])
            restarted = {"ok": code == 0, "detail": out.strip()}
    return {"saved": True, "restarted": restarted}


@app.post("/api/service/{action}", dependencies=[Depends(require_admin)])
def api_service(action: str):
    if action not in ("start", "stop", "restart"):
        raise HTTPException(400, "action must be start|stop|restart")
    svc = load_config().get("service", {}).get("name")
    if not svc:
        raise HTTPException(400, "no service configured")
    code, out = _run(["sudo", "systemctl", action, svc])
    return {"ok": code == 0, "state": service_active(svc), "detail": out.strip()}


@app.get("/api/logs", dependencies=[Depends(require_admin)])
def api_logs(lines: int = 200):
    svc = load_config().get("service", {}).get("name", "")
    code, out = _run(
        ["journalctl", "-u", svc, "-n", str(lines), "--no-pager", "-o", "short-iso"]
    )
    return {"ok": code == 0, "log": out}


@app.get("/api/i2c-scan", dependencies=[Depends(require_admin)])
def api_i2c():
    return i2c_scan(max_age=0)  # button = force a fresh scan


@app.post("/api/mqtt/test", dependencies=[Depends(require_admin)])
def api_mqtt_test(body: dict):
    m = load_config().get("mqtt", {})
    return mqtt_test(
        body.get("broker", m.get("broker")),
        body.get("port", m.get("port", 8883)),
        body.get("tls", m.get("tls", True)),
        body.get("username", m.get("username")),
        # if the client didn't resend the password, fall back to the saved one
        body.get("password") or m.get("password"),
    )


@app.get("/api/nodered/status", dependencies=[Depends(require_admin)])
def nr_status():
    svc, url, token = _nodered()
    reachable, detail = False, ""
    try:
        code, _ = _http_json("GET", f"{url}/settings", token, timeout=5)
        reachable = code == 200
    except Exception as e:
        detail = str(e)
    return {
        "service": {"name": svc, "state": service_active(svc)},
        "admin_url": url,
        "reachable": reachable,
        "broker_connected": LIVE.get("connected", False),
        "detail": detail,
    }


@app.post("/api/nodered/service/{action}", dependencies=[Depends(require_admin)])
def nr_service(action: str):
    if action not in ("start", "stop", "restart"):
        raise HTTPException(400, "action must be start|stop|restart")
    svc, *_ = _nodered()
    code, out = _run(["sudo", "systemctl", action, svc])
    return {"ok": code == 0, "state": service_active(svc), "detail": out.strip()}


@app.get("/api/nodered/broker", dependencies=[Depends(require_admin)])
def nr_broker_get():
    _, url, token = _nodered()
    try:
        node = _find_broker(_get_flows(url, token))
    except Exception as e:
        raise HTTPException(502, f"Cannot reach Node-RED admin API at {url}: {e}")
    if not node:
        return {"found": False, "detail": "No MQTT broker (mqtt-broker or aedes) node in the active flows."}
    return {
        "found": True,
        "id": node.get("id"),
        "type": node.get("type"),
        "name": node.get("name") or node.get("type"),
        "props": _aedes_props(node),
        # mqtt-broker keeps user/password as encrypted credentials, not in the
        # flow — the UI shows blank inputs the user can (re)set.
        "credentials": node.get("type") == "mqtt-broker",
    }


@app.put("/api/nodered/broker", dependencies=[Depends(require_admin)])
def nr_broker_put(body: dict):
    _, url, token = _nodered()
    props = body.get("props", {})
    try:
        flows = _get_flows(url, token)
    except Exception as e:
        raise HTTPException(502, f"Cannot reach Node-RED admin API: {e}")
    node = _find_broker(flows)
    if not node:
        raise HTTPException(404, "No MQTT broker node found")
    for k, v in props.items():  # keep the original field type
        cur = node.get(k)
        if isinstance(cur, bool):
            node[k] = bool(v)
        elif isinstance(cur, int) and not isinstance(cur, bool):
            try:
                node[k] = int(v)
            except Exception:
                node[k] = v
        elif isinstance(cur, float):
            try:
                node[k] = float(v)
            except Exception:
                node[k] = v
        else:
            node[k] = v
    # Username/password on an mqtt-broker node are credentials, not flow fields.
    if node.get("type") == "mqtt-broker":
        creds = {}
        if body.get("username") is not None:
            creds["user"] = body["username"]
        if body.get("password"):
            creds["password"] = body["password"]
        if creds:
            node["credentials"] = creds
    try:
        _http_json(
            "POST", f"{url}/flows", token, body=flows,
            headers={"Node-RED-Deployment-Type": "full"},
        )
    except Exception as e:
        raise HTTPException(502, f"Deploy failed: {e}")
    return {"ok": True, "deployed": True}


@app.post("/api/nodered/point-logger", dependencies=[Depends(require_admin)])
def nr_point_logger():
    """Point the gas reader at this Pi's local Aedes broker."""
    _, url, token = _nodered()
    port = 1883
    try:
        node = _find_aedes(_get_flows(url, token))
        if node and node.get("mqtt_port"):
            port = int(node["mqtt_port"])
    except Exception:
        pass
    cfg = load_config()
    cfg.setdefault("mqtt", {}).update({"broker": "127.0.0.1", "port": port, "tls": False})
    save_config(cfg)
    reader_svc = cfg.get("service", {}).get("name")
    restarted = None
    if reader_svc:
        code, _ = _run(["sudo", "systemctl", "restart", reader_svc])
        restarted = {"ok": code == 0}
    return {"ok": True, "broker": "127.0.0.1", "port": port, "restarted": restarted}


@app.get("/api/live-broker", dependencies=[Depends(require_admin)])
def live_broker_get():
    lb = load_config().get("live_broker", {}) or {}
    eff = _effective_live_broker()
    return {
        "override": {
            "host": lb.get("host", ""),
            "port": lb.get("port", 8883),
            "tls": lb.get("tls", True),
            "username": lb.get("username", ""),
            "topic_prefix": lb.get("topic_prefix", ""),
        },
        "effective": {
            k: eff[k] for k in ("host", "port", "tls", "username", "topic_prefix", "source")
        },
        "connected": LIVE.get("connected", False),
    }


@app.put("/api/live-broker", dependencies=[Depends(require_admin)])
def live_broker_put(body: dict):
    cfg = load_config()
    lb = cfg.get("live_broker", {}) or {}
    for k in ("host", "port", "tls", "username", "topic_prefix"):
        if k in body:
            lb[k] = body[k]
    if body.get("password"):  # only overwrite when provided
        lb["password"] = body["password"]
    cfg["live_broker"] = lb
    save_config(cfg)
    _start_live_subscriber()  # reconnect with the new settings
    time.sleep(1.5)  # brief moment to report the outcome
    return {"ok": True, "connected": LIVE.get("connected", False)}


@app.post("/api/calibrate/zero", dependencies=[Depends(require_admin)])
def api_zero_cal():
    """
    Run the zero-calibration routine: stop the reader (I2C contention), run
    zero_cal.py, then restart. zero_cal.py should print JSON of the new zeros;
    we merge them back into config.sensors.
    """
    cfg = load_config()
    svc = cfg.get("service", {}).get("name")
    if svc:
        _run(["sudo", "systemctl", "stop", svc])
    code, out = _run(["python3", "zero_cal.py", "--json"], timeout=120)
    if svc:
        _run(["sudo", "systemctl", "start", svc])
    zeros = None
    try:
        zeros = json.loads(out.strip().splitlines()[-1])
    except Exception:
        pass
    if zeros:
        sensors = cfg.get("sensors", {})
        for key, z in zeros.items():
            if key in sensors:
                sensors[key].update(
                    {k: z[k] for k in ("we_zero_v", "ae_zero_v") if k in z}
                )
        save_config(cfg)
    return {"ok": code == 0, "zeros": zeros, "detail": out.strip()[-1000:]}


# --------------------------------------------------------------------------
# History (local SQLite) — what the History tab reads
# --------------------------------------------------------------------------
def _history_store():
    cfg = load_config()
    store = open_store(cfg)
    if store is None:
        raise HTTPException(404, "Local storage is disabled (storage.enabled in config.yaml)")
    return store, cfg


def _history_args(stream: str, start: Optional[int], end: Optional[int]):
    if stream not in STREAMS:
        raise HTTPException(400, f"stream must be one of {', '.join(STREAMS)}")
    end = int(end) if end is not None else int(time.time()) + 1
    start = int(start) if start is not None else end - 86400
    if start >= end:
        raise HTTPException(400, "start must be before end")
    return start, end


def _db_error(e: Exception):
    return HTTPException(500, f"Local storage error: {e}")


@app.get("/api/history/summary", dependencies=[Depends(require_admin)])
def history_summary():
    cfg = load_config()
    s = storage_settings(cfg)
    if not s["enabled"]:
        return {"enabled": False}
    try:
        summary = open_store(cfg).summary()
    except Exception as e:
        raise _db_error(e)
    return {
        "enabled": True,
        "path": str(s["path"]),
        "retention_days": s["retention_days"],
        "timezone": (cfg.get("device") or {}).get("timezone"),
        "error": STORE_STATE["error"],
        **summary,
    }


@app.get("/api/history/series", dependencies=[Depends(require_admin)])
def history_series(
    stream: str,
    start: Optional[int] = None,
    end: Optional[int] = None,
    field: List[str] = Query(default=[]),
    points: int = 600,
):
    """Bucketed mean/min/max per field for the charts."""
    start, end = _history_args(stream, start, end)
    fields = list(dict.fromkeys(field))[:12]
    try:
        for f in fields:
            json_path(f)
    except ValueError as e:
        raise HTTPException(400, str(e))
    store, _ = _history_store()
    try:
        out = store.series(stream, start, end, fields, max(10, min(points, 2000)))
    except Exception as e:
        raise _db_error(e)
    return {"stream": stream, "start": start, "end": end, **out}


@app.get("/api/history/rows", dependencies=[Depends(require_admin)])
def history_rows(
    stream: str,
    start: Optional[int] = None,
    end: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    """Raw readings, newest first, for the table."""
    start, end = _history_args(stream, start, end)
    store, _ = _history_store()
    try:
        return store.rows(stream, start, end, max(1, min(limit, 500)), max(0, offset))
    except Exception as e:
        raise _db_error(e)


@app.get("/api/history/export.csv", dependencies=[Depends(require_admin)])
def history_export(
    stream: str,
    start: Optional[int] = None,
    end: Optional[int] = None,
    tz: Optional[str] = None,
):
    """Every stored field for the range, oldest first, as a CSV download."""
    start, end = _history_args(stream, start, end)
    store, cfg = _history_store()
    zone = None
    for name in (tz, (cfg.get("device") or {}).get("timezone")):
        if not name:
            continue
        try:
            from zoneinfo import ZoneInfo

            zone = ZoneInfo(name)
            break
        except Exception:
            continue
    stamp = lambda t: datetime.fromtimestamp(t, zone).strftime("%Y%m%d-%H%M")
    filename = f"bayu-{stream}-{stamp(start)}_to_{stamp(end)}.csv"
    return StreamingResponse(
        csv_chunks(store.iter_payloads(stream, start, end), zone),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    """Stream the reader's most recent report every ~2s."""
    await ws.accept()
    try:
        while True:
            # Build off the event loop — read_status_file() and i2c_scan() do
            # blocking I/O / subprocess work.
            payload = await asyncio.to_thread(
                lambda: {
                    "latest": read_status_file(),  # gas from reader status file (offline-safe)
                    "live": LIVE,  # gas + particulate + weather from the local broker
                    "i2c": i2c_scan(),
                }
            )
            await ws.send_json(payload)
            await asyncio.sleep(2)
    except Exception:
        return


# Serve the UI (mounted last so /api and /ws win).
@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
