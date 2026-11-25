"""
Calibration API for the portal's Calibration tab.

A calibration is a session with five steps (the wizard in the UI):

  1. start   cylinder details are recorded; the gas reader samples every 5 s
  2. before  readings are watched until every gas is stable
  3. stop    pre-calibration = average of the last 3 minutes; the new zero
             (zero air) or new output gain (span gas) is calculated
  4. apply   the new value is written to the caller's level (Client -> user,
             Manufacturer -> manufacturer); readings tagged with the new
             calibration version are recorded as "after"
  5. save    post-calibration average, pass/fail, and the whole session
             (details + readings) is stored as a calibration record

Readings come from the local history (storage.py), written by the gas reader.
The Client login never receives gains/offsets (m, c) from this API: they are
removed on the server, not just hidden in the page.
"""
from __future__ import annotations

import csv
import html
import io
import json
import os
import threading
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.security import HTTPBasicCredentials

import calibration as C
from auth import require_login, security, who
from config import load_config
from storage import open_store

router = APIRouter(prefix="/api/calibration")

CLIENT_GROUPS = ("zero", "sens")      # all the Client login may see
FAST_HOLD = 600                       # reader falls back to normal if the page stops polling
LABEL = {"co": "CO", "ox": "OX", "no2": "NO₂", "so2": "SO₂", "o3": "O₃"}
LVNAME = {"factory": "Factory", "manufacturer": "Manufacturer", "user": "User"}

_lock = threading.RLock()


def label(gas: str, role: str) -> str:
    """The Client sees the OX-B431 sensor as O₃."""
    return "O₃" if gas == "ox" and role == "client" else LABEL[gas]


GASNAME = {"co": "CO", "ox": "O₃", "no2": "NO₂", "so2": "SO₂"}  # what the span gas itself is


def _tgt(s: dict, g: str) -> float:
    """Span target of one gas in its display unit (older records have one target)."""
    t = s.get("targets") or {}
    return float(t[g]) if g in t else float(s.get("target") or 0.0)


def _cyl_ppm(s: dict, g: str) -> float:
    c = s.get("cyl_ppm")
    return float(c.get(g, 0.0)) if isinstance(c, dict) else float(c or 0.0)


def _conc_txt(s: dict, g: str) -> str:
    """'0.5 ppm = 500 ppb', or for the O3 sensor with NO2: '0.2 ppm O₃ + 0.5 ppm NO₂ = 700 ppb'."""
    if (s.get("type") or s.get("kind")) == "zero":
        return "0 ppm (zero air)"
    t, unit = _tgt(s, g), C.UNIT[g]
    adds = (s.get("adds") or {}).get(g) or []
    if adds:
        parts = [f"{_cyl_ppm(s, x):g} ppm {GASNAME[x]}" for x in [g] + adds]
        return " + ".join(parts) + f" = {t:g} {unit}"
    return f"{t / 1000:g} ppm = {t:g} ppb" if unit == "ppb" else f"{t:g} ppm"


def _source(s: dict, g: str) -> dict:
    """Where a gas came from: a cylinder (company + certificate) or the ozone calibrator."""
    kind = s.get("type") or s.get("kind")
    if kind == "span" and g == "ox":
        return {"from": "Ozone calibrator", "cert": ""}
    cyl = (s.get("cylinders") or {}).get(g) or {}
    info = s.get("info") or {}
    return {"from": cyl.get("company") or info.get("company") or "", "cert": cyl.get("cert") or info.get("cert") or ""}


def settings() -> dict:
    c = (load_config().get("calibration") or {})
    return {
        "fast_interval_s": float(c.get("fast_interval_s", 5)),      # reader interval during a calibration
        "pre_window_s": float(c.get("pre_window_s", 180)),          # pre-calibration = average of the last 3 min
        "min_before_s": float(c.get("min_before_s", 180)),          # gas must flow this long before Stop
        "min_after_s": float(c.get("min_after_s", 180)),            # after-correction readings needed before Save
        "stop_anyway_s": float(c.get("stop_anyway_s", 900)),        # Stop allowed after 15 min even if not stable
        "span_tolerance_pct": float(c.get("span_tolerance_pct", 3.0)),
        "stable_span_pct": float(c.get("stable_span_pct", 1.0)),
        "stable_zero": {"co": 0.02, "ox": 3.0, "no2": 3.0, "so2": 3.0, **(c.get("stable_zero") or {})},
        "zero_pass": {"co": 0.05, "ox": 10.0, "no2": 10.0, "so2": 10.0, **(c.get("zero_pass") or {})},
    }


def _store():
    st = open_store(load_config())
    if st is None:
        raise HTTPException(409, "Local storage is turned off (storage.enabled in config.yaml); calibration needs it")
    return st


# --------------------------------------------------------------------------
# Session file (also read by the gas reader to sample faster)
# --------------------------------------------------------------------------
def _load_session() -> Optional[dict]:
    try:
        return json.loads(C.session_path().read_text())
    except FileNotFoundError:
        return None
    except Exception:
        return None


def _save_session(s: dict) -> None:
    s["fast_interval"] = settings()["fast_interval_s"]
    s["fast_until"] = time.time() + FAST_HOLD
    p = C.session_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(s))
    os.replace(tmp, p)


def _end_session() -> None:
    try:
        C.session_path().unlink()
    except FileNotFoundError:
        pass


def _need_setup() -> None:
    """Writing a level before `calibration.py init` would make the reader fall
    back to the generic factory values for every other gas."""
    if not C.level_path("manufacturer").exists():
        raise HTTPException(409, "Calibration isn't set up on this logger yet. On the Pi run: "
                                 "python3 calibration.py init")


def _creator(rec: dict) -> str:
    """Which login made a record or session (older records have no role field)."""
    r = rec.get("role")
    if r in ("client", "manufacturer"):
        return r
    if rec.get("level") == "manufacturer" or str(rec.get("by", "")).endswith("(manufacturer)"):
        return "manufacturer"
    return "client"


def _visible(rec: dict, role: str) -> bool:
    """The Manufacturer sees everything; the Client only what the Client made."""
    return role == "manufacturer" or _creator(rec) == "client"


MFR_BUSY = "This logger is being calibrated right now. You can start your own calibration when it's finished."


def _need_session(role: str) -> dict:
    s = _load_session()
    if not s:
        raise HTTPException(409, "No calibration is running")
    if not _visible(s, role):
        raise HTTPException(403, MFR_BUSY)
    return s


# --------------------------------------------------------------------------
# Readings during a session
# --------------------------------------------------------------------------
def _entry(payload: dict, gas: str):
    e = payload.get(C.NAME[gas])
    if not isinstance(e, dict):
        return None, None, None
    v = e.get(f"{C.NAME[gas]}_{C.UNIT[gas]}")
    return (v if isinstance(v, (int, float)) else None), e.get("OP1_V"), e.get("OP2_V")


def _mean(xs):
    return sum(xs) / len(xs) if xs else None


def _collect(s: dict, now: float) -> dict:
    """Split the session's readings into before / after (and the transition
    after Apply while the reader picks up the new calibration)."""
    rows = list(_store().iter_payloads("gas", int(s["t0"]), int(now) + 1))
    t_stop, t_apply = s.get("t_stop"), s.get("t_apply")
    data = {"t": [], "phase": [], "cal_tagged": False}
    for g in s["gases"]:
        data[g] = {"v": [], "op1": [], "op2": []}
    for ts, p in rows:
        if t_apply and ts > t_apply:
            phase = "a" if p.get("cal") == s.get("cal_version") else "x"
        elif t_stop and ts > t_stop:
            phase = "x"
        else:
            phase = "b"
        if "cal" in p:
            data["cal_tagged"] = True
        data["t"].append(ts)
        data["phase"].append(phase)
        for g in s["gases"]:
            v, o1, o2 = _entry(p, g)
            data[g]["v"].append(v)
            data[g]["op1"].append(o1)
            data[g]["op2"].append(o2)
    return data


def _window(data: dict, gas: str, phase: str, t_from: float, t_to: float, key: str = "v") -> list:
    return [v for t, ph, v in zip(data["t"], data["phase"], data[gas][key])
            if ph == phase and v is not None and t_from < t <= t_to]


def _stable(s: dict, data: dict, gas: str, cfg: dict) -> dict:
    ts_b = [t for t, ph, v in zip(data["t"], data["phase"], data[gas]["v"]) if ph == "b" and v is not None]
    if not ts_b:
        return {"stable": False, "why": "no readings yet"}
    last = ts_b[-1]
    if last - s["t0"] < cfg["min_before_s"]:
        return {"stable": False, "why": "settling"}
    half = cfg["pre_window_s"] / 2  # compare the two halves of the pre-calibration window
    recent = _window(data, gas, "b", last - half, last)
    prior = _window(data, gas, "b", last - 2 * half, last - half)
    if len(recent) < 2 or len(prior) < 2:
        return {"stable": False, "why": "settling"}
    diff = abs(_mean(recent) - _mean(prior))
    limit = (_tgt(s, gas) * cfg["stable_span_pct"] / 100.0 if s["type"] == "span"
             else float(cfg["stable_zero"].get(gas, 3.0)))
    return {"stable": diff <= limit, "why": "stable" if diff <= limit else "settling", "drift": diff, "limit": limit}


def _passes(s: dict, gas: str, post: float, cfg: dict) -> bool:
    if s["type"] == "span":
        t = _tgt(s, gas)
        return abs(post - t) / t * 100.0 <= s["tol"]
    return abs(post) <= float(cfg["zero_pass"].get(gas, 10.0))


def _state(s: dict, role: str) -> dict:
    """Everything the wizard shows, for the current moment."""
    now = time.time()
    cfg = settings()
    data = _collect(s, now)
    gases, out = s["gases"], {}
    for g in gases:
        b = [(t, v) for t, ph, v in zip(data["t"], data["phase"], data[g]["v"]) if ph == "b" and v is not None]
        a = [(t, v) for t, ph, v in zip(data["t"], data["phase"], data[g]["v"]) if ph == "a" and v is not None]
        st = _stable(s, data, g, cfg) if s["phase"] == "before" else {"stable": True}
        post = _mean([v for _, v in a])
        out[g] = {
            "label": label(g, role), "unit": C.UNIT[g],
            "current": (a or b or [(None, None)])[-1][1],
            "stable": st["stable"], "status": st.get("why"),
            "pre_live": _mean([v for t, v in b if t > b[-1][0] - cfg["pre_window_s"]]) if b else None,
            "post": post,
            "pass": _passes(s, g, post, cfg) if post is not None and s["phase"] == "after" else None,
            "after_span_s": (a[-1][0] - a[0][0]) if len(a) > 1 else 0,
            "n_after": len(a),
        }
    first_b = next((t for t, ph in zip(data["t"], data["phase"]) if ph == "b"), None)
    elapsed = now - s["t0"]
    hint = None
    if not data["t"] and elapsed > 60:
        hint = "No readings yet. Check that the gas reader service is running."
    if s["phase"] == "after" and not any(o["n_after"] for o in out.values()):
        since = now - (s.get("t_apply") or now)
        if since > 120:
            hint = ("The gas reader hasn't picked up the new calibration yet. "
                    + ("" if data["cal_tagged"] else "It doesn't tag readings: update 4_gas_reader.py."))
        else:
            hint = "Waiting for the gas reader to use the new calibration (one reading cycle)."
    can_stop = s["phase"] == "before" and bool(first_b) and (
        all(o["stable"] for o in out.values()) or elapsed >= cfg["stop_anyway_s"])
    can_save = s["phase"] == "after" and all(o["n_after"] >= 3 and o["after_span_s"] >= cfg["min_after_s"] for o in out.values())
    return {
        "active": True, "session": _public_session(s, role), "gases": out, "elapsed_s": elapsed,
        "can_stop": can_stop, "stop_unstable": can_stop and not all(o["stable"] for o in out.values()),
        "can_save": can_save, "hint": hint,
        "chart": {"t0": s["t0"], "t": [t - s["t0"] for t in data["t"]], "phase": data["phase"],
                  **{g: data[g]["v"] for g in gases}},
    }


# --------------------------------------------------------------------------
# What each login may see
# --------------------------------------------------------------------------
def _public_result(r: dict, role: str) -> dict:
    """Client never gets gains/offsets; zero values are fine."""
    r = dict(r)
    if role == "client" and r.get("key") != "zero":
        r.pop("before", None)
        r.pop("after", None)
    return r


def _public_session(s: dict, role: str) -> dict:
    keep = ("id", "type", "gases", "target", "targets", "cyl_ppm", "source", "cylinders", "adds", "tol", "level",
            "by", "t0", "t_stop", "t_apply", "phase", "info", "warnings")
    out = {k: s.get(k) for k in keep}
    out["targets"] = {g: _tgt(s, g) for g in s["gases"]}
    out["conc_text"] = {g: _conc_txt(s, g) for g in s["gases"]}
    out["sources"] = {g: _source(s, g) for g in s["gases"]}
    out["labels"] = {g: label(g, role) for g in s["gases"]}
    out["units"] = {g: C.UNIT[g] for g in s["gases"]}
    if s.get("results"):
        out["results"] = {g: _public_result(r, role) for g, r in s["results"].items()}
    return out


def _public_record(rec: dict, role: str, full: bool) -> dict:
    r = {k: v for k, v in rec.items() if k not in ("data", "removed")}
    r["labels"] = {g: label(g, role) for g in rec.get("gases", [])}
    r["units"] = {g: C.UNIT[g] for g in rec.get("gases", [])}
    if rec.get("kind") in ("zero", "span"):
        r["targets"] = {g: _tgt(rec, g) for g in rec["gases"]}
        r["conc_text"] = {g: _conc_txt(rec, g) for g in rec["gases"]}
        r["sources"] = {g: _source(rec, g) for g in rec["gases"]}
    if rec.get("results"):
        r["results"] = {g: _public_result(x, role) for g, x in rec["results"].items()}
        r["pass_all"] = all(x.get("pass") for x in rec["results"].values())
    if full and rec.get("data"):
        d = rec["data"]
        r["chart"] = {"t0": rec["t0"], "t": [t - rec["t0"] for t in d["t"]], "phase": d["phase"],
                      **{g: d[g]["v"] for g in rec["gases"] if g in d}}
    if role == "manufacturer" and rec.get("removed") is not None:
        r["removed"] = rec["removed"]
    return r


# --------------------------------------------------------------------------
# Values in use + resets
# --------------------------------------------------------------------------
def _client_table(cal, gases) -> dict:
    """What the Client sees: its own value ("user") or the value used without it
    ("default"); the manufacturer and factory levels are not named or shown apart."""
    out = {}
    for g in gases:
        out[g] = {}
        for grp in CLIENT_GROUPS:
            own = cal.layers["user"].get(g, {}).get(grp)
            dflt = next(cal.layers[lv][g][grp] for lv in ("manufacturer", "factory")
                        if cal.layers[lv].get(g, {}).get(grp) is not None)
            out[g][grp] = {"value": own if own is not None else dflt,
                           "level": "user" if own is not None else "default",
                           "levels": {"user": own, "default": dflt}}
    return out


@router.get("/values")
def values(role: str = Depends(require_login)):
    cal = C.load()
    client = role == "client"
    gases = C.GASES if client else C.ALL
    if client:
        return {
            "role": role, "version": cal.version, "errors": [],
            "labels": {g: label(g, role) for g in gases},
            "units": {g: C.UNIT[g] for g in gases},
            "gases": _client_table(cal, gases),
            "has": {g: {"user": bool(cal.layers["user"].get(g))} for g in gases},
            "settings": settings(),
            "set_up": C.level_path("manufacturer").exists(),
        }
    return {
        "role": role,
        "version": cal.version,
        "errors": [] if client else cal.errors,
        "labels": {g: label(g, role) for g in gases},
        "units": {g: C.UNIT[g] for g in gases},
        "gases": cal.table(gases, CLIENT_GROUPS if client else None),
        # whether a level holds anything for a gas (a client can reset gains it can't see)
        "has": {g: {lv: bool(cal.layers[lv].get(g)) for lv in C.WRITABLE} for g in gases},
        "settings": settings(),
        "set_up": C.level_path("manufacturer").exists(),
    }


@router.post("/reset")
def reset(body: dict, role: str = Depends(require_login), creds: HTTPBasicCredentials = Depends(security)):
    gas, level = body.get("gas"), body.get("level")
    if gas not in C.ALL:
        raise HTTPException(400, "Unknown gas")
    allowed = ("user",) if role == "client" else ("user", "manufacturer")
    if level not in allowed:
        raise HTTPException(403, "You can only clear your own values")
    _need_setup()
    with _lock:
        running = _load_session()
        if running:
            raise HTTPException(409, "A calibration is running. Finish or cancel it first."
                                if _visible(running, role) else MFR_BUSY)
        removed = C.clear_gas(level, gas)
        if not removed:
            raise HTTPException(400, f"There are no {LVNAME.get(level, level)} values for {label(gas, role)}")
        now_lv = C.load().resolve(gas, C.groups_for(gas)[0])[1]
        rec = {"kind": "reset", "gases": [gas], "level": level, "by": who(role, creds), "role": role, "t0": time.time(),
               "note": f"{LVNAME[level]} values cleared", "removed": removed}
        rid = _store().add_calibration(rec)
    return {"ok": True, "id": rid, "now_uses": "default" if role == "client" else now_lv}


# --------------------------------------------------------------------------
# Records
# --------------------------------------------------------------------------
@router.get("/records")
def records(role: str = Depends(require_login)):
    return {"records": [_public_record(r, role, full=False) for r in _store().list_calibrations() if _visible(r, role)]}


def _record_or_404(rid: int, role: str) -> dict:
    rec = _store().get_calibration(rid)
    if not rec or not _visible(rec, role):  # 404 either way, so a client can't probe for manufacturer records
        raise HTTPException(404, "No such calibration record")
    return rec


@router.get("/records/{rid}")
def record(rid: int, role: str = Depends(require_login)):
    return _public_record(_record_or_404(rid, role), role, full=True)


@router.get("/records/{rid}/data.csv")
def record_csv(rid: int, role: str = Depends(require_login)):
    rec = _record_or_404(rid, role)
    d = rec.get("data")
    if not d:
        raise HTTPException(404, "This record has no readings")
    buf = io.StringIO()
    w = csv.writer(buf)
    head = ["time", "unix_ts", "phase"]
    for g in rec["gases"]:
        n = "O3" if g == "ox" and role == "client" else C.NAME[g]  # plain ASCII headers for Excel
        head += [f"{n}_{C.UNIT[g]}", f"{n}_OP1_V", f"{n}_OP2_V"]
    w.writerow(head)
    names = {"b": "before", "a": "after", "x": "transition"}
    for i, t in enumerate(d["t"]):
        row = [time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)), t, names.get(d["phase"][i], d["phase"][i])]
        for g in rec["gases"]:
            row += [d[g]["v"][i], d[g]["op1"][i], d[g]["op2"][i]]
        w.writerow(row)
    name = f"calibration-{rid}-{rec['kind']}-{time.strftime('%Y%m%d-%H%M', time.localtime(rec['t0']))}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _fmt_t(t) -> str:
    return time.strftime("%H:%M, %d/%m/%y", time.localtime(t)) if t else "—"


def _fmt_v(v, gas) -> str:
    if v is None:
        return "—"
    return f"{v:.3f}" if C.UNIT[gas] == "ppm" else f"{v:.1f}"


@router.get("/records/{rid}/certificate", response_class=HTMLResponse)
def certificate(rid: int, role: str = Depends(require_login)):
    rec = _record_or_404(rid, role)
    if rec["kind"] == "reset":
        raise HTTPException(400, "Resets have no certificate")
    pub = _public_record(rec, role, full=False)
    dev = load_config().get("device") or {}
    e = html.escape
    info = rec.get("info") or {}
    g0 = rec["gases"][0]
    rows = [
        ("Type", "Zero calibration" if rec["kind"] == "zero" else "Span calibration"),
        ("Device", f"{dev.get('name', '')} ({dev.get('id', '')})"),
        ("Gas", ", ".join(label(g, role) for g in rec["gases"])),
        ("Start time", _fmt_t(rec["t0"])), ("End time", _fmt_t(rec.get("t1"))),
        ("Gas flow rate", f"{info.get('flow', '—')} SCCM"), ("Gas pressure", f"{info.get('pressure', '—')} bar"),
        ("Temperature", f"{info.get('temp', '—')} °C"),
        ("Pass limit", f"± {rec.get('tol')} %" if rec["kind"] == "span" else "zero ± limit per gas"),
        ("Done by", rec.get("by", "")), ("Saved to level", LVNAME.get(rec["level"], rec["level"])),
    ]
    out_rows = "".join(
        f"<tr><td>{e(label(g, role))}</td><td>{e('0 ppm' if rec['kind'] == 'zero' else _conc_txt(rec, g))}</td>"
        f"<td>{_fmt_v(r.get('pre'), g)} {C.UNIT[g]}</td><td>{_fmt_v(r.get('post'), g)} {C.UNIT[g]}</td>"
        f"<td>{'PASS' if r.get('pass') else 'FAIL'}</td></tr>"
        for g, r in pub["results"].items())
    chg = "".join(
        f"<tr><td>{e(label(g, role))}</td><td>Zero (WE₀ / AE₀)</td>"
        f"<td>{r['before'][0]:.5f} / {r['before'][1]:.5f} V</td><td>{r['after'][0]:.5f} / {r['after'][1]:.5f} V</td></tr>"
        if r.get("key") == "zero" else
        f"<tr><td>{e(label(g, role))}</td><td>Gain &amp; offset (m₃ · c₃)</td>"
        f"<td>m {r['before'][0]:.4f} · c {r['before'][1]:g}</td><td>m {r['after'][0]:.4f} · c {r['after'][1]:g}</td></tr>"
        for g, r in pub["results"].items() if "after" in r)
    if rec["kind"] == "zero":
        src = _source(rec, g0)
        used = (f"<tr><td>Zero air ({e(', '.join(label(g, role) for g in rec['gases']))})</td><td>0 ppm</td>"
                f"<td>{e(src['from'] or '—')}</td><td>{e(src['cert'] or '—')}</td></tr>")
    else:
        used = "".join(f"<tr><td>{e(label(g, role))}</td><td>{e(_conc_txt(rec, g))}</td>"
                       f"<td>{e(_source(rec, g)['from'] or '—')}</td><td>{e(_source(rec, g)['cert'] or '—')}</td></tr>"
                       for g in rec["gases"])
    used_block = (f"<h2>Gas used</h2><table><tr><th>Gas</th><th>Gas value</th><th>From</th>"
                  f"<th>Certificate no.</th></tr>{used}</table>")
    chg_block = (f"<h2>What changed</h2><table><tr><th>Gas</th><th>Setting</th><th>Value before calibration</th>"
                 f"<th>Value after calibration</th></tr>{chg}</table>") if chg else ""
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Calibration certificate #{rid}</title>
<style>body{{font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif;color:#1f2a44;max-width:820px;margin:32px auto;padding:0 20px}}
h1{{font-size:22px;margin:0}} h2{{font-size:15px;margin:26px 0 8px}} .sub{{color:#6b7691}}
table{{width:100%;border-collapse:collapse;font-size:13.5px}} th,td{{text-align:left;padding:7px 9px;border-bottom:1px solid #e6e9f2}}
th{{color:#6b7691;font-weight:600}} dl{{display:grid;grid-template-columns:200px 1fr;gap:6px 14px;margin:16px 0 0}} dt{{color:#6b7691}} dd{{margin:0;font-weight:600}}
.sign{{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:56px}} .sign div{{border-top:1px solid #1f2a44;padding-top:6px;color:#6b7691}}
button{{margin-top:24px;padding:9px 16px;border:0;border-radius:10px;background:#3b5bfd;color:#fff;font-weight:600;cursor:pointer}}
@media print{{button{{display:none}} body{{margin:0}}}}</style></head><body>
<h1>Calibration certificate</h1><div class="sub">Record #{rid} · Bayu Logger</div>
<dl>{''.join(f'<dt>{e(k)}</dt><dd>{e(str(v))}</dd>' for k, v in rows)}</dl>
{used_block}
<h2>Calibration output</h2><table><tr><th>Gas</th><th>Gas value</th><th>Pre-calibration</th><th>Post-calibration</th><th>Result</th></tr>{out_rows}</table>
{chg_block}
<div class="sign"><div>Calibrated by</div><div>Checked by</div></div>
<button onclick="window.print()">Print or save as PDF</button></body></html>"""
    return HTMLResponse(page)


# --------------------------------------------------------------------------
# The wizard
# --------------------------------------------------------------------------
@router.get("/session")
def session_get(role: str = Depends(require_login)):
    with _lock:
        s = _load_session()
        if not s:
            return {"active": False}
        if not _visible(s, role):
            return {"active": False, "busy": MFR_BUSY}
        _save_session(s)  # keep the reader in fast mode while someone is watching
        return _state(s, role)


def _num(body: dict, key: str, what: str, positive: bool = True) -> float:
    try:
        v = float(body.get(key))
    except (TypeError, ValueError):
        raise HTTPException(400, f"Enter the {what} as a number")
    if positive and not v > 0:
        raise HTTPException(400, f"The {what} must be above 0")
    return v


@router.post("/session/start")
def session_start(body: dict, role: str = Depends(require_login), creds: HTTPBasicCredentials = Depends(security)):
    _need_setup()
    kind = body.get("type")
    if kind not in ("zero", "span"):
        raise HTTPException(400, "Choose zero or span")
    gases = [g for g in C.GASES if g in (body.get("gases") or [])]
    if not gases:
        raise HTTPException(400, "Pick at least one gas")
    txt = lambda k: str(body.get(k) or "").strip()[:80]
    info = {k: txt(k) for k in ("flow", "pressure", "temp", "company", "cert")}
    cyl, targets, adds, cylinders, source, tol = {}, {}, {}, {}, None, None
    cyl_gases = [g for g in gases if g != "ox"] if kind == "span" else gases  # ozone comes from a calibrator
    if kind == "zero":
        if not info["cert"]:
            raise HTTPException(400, "Enter the cylinder certificate no. before you start recording")
        targets = {g: 0.0 for g in gases}
    else:
        raw = body.get("cyl_ppm")
        for g in gases:
            v = raw.get(g) if isinstance(raw, dict) else raw
            try:
                v = float(v)
            except (TypeError, ValueError):
                v = 0.0
            if not v > 0:
                raise HTTPException(400, f"Enter the {label(g, role)} concentration in ppm, above 0")
            cyl[g] = v
            targets[g] = v * 1000.0 if C.UNIT[g] == "ppb" else v
        if "ox" in gases and "no2" in gases:  # the O3 sensor (OX-B431) also reacts to NO2
            targets["ox"] += targets["no2"]
            adds["ox"] = ["no2"]
        source = body.get("source") if len(cyl_gases) > 1 else "single"
        if source not in ("single", "mixed", "separate"):
            raise HTTPException(400, "Choose one mixed cylinder or separate cylinders")
        if source == "separate":
            per = body.get("cylinders") or {}
            for g in cyl_gases:
                c = per.get(g) or {}
                cert = str(c.get("cert") or "").strip()[:80]
                if not cert:
                    raise HTTPException(400, f"Enter the cylinder certificate no. for {label(g, role)} before you start recording")
                cylinders[g] = {"company": str(c.get("company") or "").strip()[:80], "cert": cert}
            info["company"] = info["cert"] = ""
        else:
            if cyl_gases and not info["cert"]:
                raise HTTPException(400, "Enter the cylinder certificate no. before you start recording")
            cylinders = {g: {"company": info["company"], "cert": info["cert"]} for g in cyl_gases}
        tol = _num(body, "tol", "pass limit (%)")
    if role == "manufacturer":
        # A client value stays on top of the manufacturer level, so a manufacturer
        # calibration of the same setting would change nothing that is used.
        key = "zero" if kind == "zero" else "out"
        user = C.load().layers["user"]
        blocked = [label(g, role) for g in gases if (user.get(g) or {}).get(key) is not None]
        if blocked:
            raise HTTPException(409, f"{', '.join(blocked)} {'uses' if len(blocked) == 1 else 'use'} the client's own "
                                     f"{'zero' if kind == 'zero' else 'span'} values, which stay on top. Clear the client "
                                     f"values first (Calibration values in use → All levels → Clear client values).")
    with _lock:
        running = _load_session()
        if running:
            raise HTTPException(409, "A calibration is already running. Finish or cancel it first."
                                if _visible(running, role) else MFR_BUSY)
        _store()  # storage must be on
        s = {"id": uuid.uuid4().hex[:10], "type": kind, "gases": gases, "target": targets[gases[0]],
             "targets": targets, "cyl_ppm": cyl, "source": source, "cylinders": cylinders, "adds": adds,
             "tol": tol, "info": info, "level": "user" if role == "client" else "manufacturer",
             "role": role, "by": who(role, creds), "t0": time.time(), "phase": "before",
             "t_stop": None, "t_apply": None, "results": None, "prev": None, "cal_version": None, "warnings": []}
        _save_session(s)
        return _state(s, role)


@router.post("/session/stop")
def session_stop(role: str = Depends(require_login)):
    with _lock:
        s = _need_session(role)
        if s["phase"] != "before":
            raise HTTPException(409, "Already stopped")
        st = _state(s, role)
        if not st["can_stop"]:
            raise HTTPException(409, "Wait until every gas is stable")
        now = time.time()
        data = _collect(s, now)
        cal = C.load()
        win = settings()["pre_window_s"]
        results, warnings = {}, []
        last = max((t for t, ph in zip(data["t"], data["phase"]) if ph == "b"), default=now)
        for g in s["gases"]:
            p = cal.params(g)
            vals = _window(data, g, "b", last - win, last)
            if len(vals) < 3:
                raise HTTPException(409, f"Not enough readings for {label(g, role)} in the last 3 minutes")
            pre = _mean(vals)
            try:
                if s["type"] == "zero":
                    key = "zero"
                    after = C.zero_from(p, _window(data, g, "b", last - win, last, "op1"),
                                        _window(data, g, "b", last - win, last, "op2"))
                else:
                    key = "out"
                    after = C.span_from(p, pre, _tgt(s, g))
                C.normalise(g, key, after)
            except C.CalibrationError as e:
                raise HTTPException(409, f"{label(g, role)}: {e}")
            results[g] = {"pre": pre, "n_pre": len(vals), "key": key, "before": p[key], "after": after,
                          "warnings": C.warnings_for(g, key, after)}
            if s["level"] == "manufacturer" and cal.layers["user"].get(g, {}).get(key) is not None:
                warnings.append(f"{label(g, role)} uses the client's own value, which stays on top of this "
                                f"calibration. Clear the client value to use the new one.")
        s.update(phase="review", t_stop=now, results=results, warnings=warnings)
        _save_session(s)
        return _state(s, role)


@router.post("/session/apply")
def session_apply(role: str = Depends(require_login)):
    with _lock:
        s = _need_session(role)
        if s["phase"] != "review":
            raise HTTPException(409, "Nothing to apply")
        level = s["level"]
        cal = C.load()
        prev = {}
        try:
            for g, r in s["results"].items():
                prev[g] = {"key": r["key"], "value": cal.layers[level].get(g, {}).get(r["key"])}
                C.set_values(level, g, {r["key"]: r["after"]})
        except C.CalibrationError as e:
            for g, pv in prev.items():
                C.set_values(level, g, {pv["key"]: pv["value"]})
            raise HTTPException(409, str(e))
        s.update(phase="after", t_apply=time.time(), prev=prev, cal_version=C.load().version)
        _save_session(s)
        return _state(s, role)


def _undo(s: dict) -> None:
    for g, pv in (s.get("prev") or {}).items():
        C.set_values(s["level"], g, {pv["key"]: pv["value"]})


@router.post("/session/cancel")
def session_cancel(role: str = Depends(require_login)):
    """Cancel at any step. If the correction was already applied it is undone."""
    with _lock:
        s = _load_session()
        if not s:
            return {"active": False}
        if not _visible(s, role):
            raise HTTPException(403, MFR_BUSY)
        undone = s["phase"] == "after"
        if undone:
            _undo(s)
        _end_session()
        return {"active": False, "undone": undone}


@router.post("/session/save")
def session_save(role: str = Depends(require_login)):
    with _lock:
        s = _need_session(role)
        st = _state(s, role)
        if not st["can_save"]:
            raise HTTPException(409, "Keep the gas flowing until enough after-correction readings are recorded")
        now = time.time()
        data = _collect(s, now)
        cfg = settings()
        results = {}
        for g, r in s["results"].items():
            post_vals = [v for v, ph in zip(data[g]["v"], data["phase"]) if ph == "a" and v is not None]
            post = _mean(post_vals)
            results[g] = {**r, "post": post, "n_post": len(post_vals), "pass": _passes(s, g, post, cfg)}
        rec = {"kind": s["type"], "gases": s["gases"], "target": s["target"], "targets": s.get("targets"),
               "cyl_ppm": s["cyl_ppm"], "source": s.get("source"), "cylinders": s.get("cylinders"), "adds": s.get("adds"),
               "tol": s["tol"], "info": s["info"], "level": s["level"], "by": s["by"], "role": s.get("role"),
               "t0": s["t0"], "t_stop": s["t_stop"], "t_apply": s["t_apply"], "t1": now,
               "cal_version": s["cal_version"], "results": results, "data": data}
        rid = _store().add_calibration(rec)
        _end_session()
        rec["id"] = rid
        return {"active": False, "saved": _public_record(rec, role, full=False)}
