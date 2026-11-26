#!/usr/bin/env python3
"""
Gas sensor diagnostics for the Bayu logger. Reads only; changes nothing.

    python3 diagnose_gas.py            # history: when did electrode voltages change, and what happened then
    python3 diagnose_gas.py adc        # what the two ADC chips see right now (stop gas-monitor.service first)

History mode uses the readings saved on the Pi (data/bayu.db), the calibration
records, the system journal (boots, reader restarts) and the Pi's power flags.
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import load_config  # noqa: E402
from storage import storage_settings  # noqa: E402

GASES = ("CO", "OX", "NO2", "SO2")
JUMP = 0.15  # V: an electrode that moves more than this from its own starting level is flagged


def _fmt(ts: float) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))


def _run(cmd: list) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=20).stdout
    except Exception as e:  # tool missing, no permission, ...
        return f"({cmd[0]}: {e})"


def history(days: float = 7.0) -> None:
    cfg = load_config()
    path = storage_settings(cfg)["path"]
    print(f"Database: {path}")
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    since = time.time() - days * 86400
    rows = [(ts, json.loads(p)) for ts, p in con.execute(
        "SELECT ts, payload FROM readings WHERE stream = 'gas' AND ts >= ? ORDER BY ts", (since,))]
    print(f"Gas readings in the last {days:g} days: {len(rows)}"
          + (f" ({_fmt(rows[0][0])} -> {_fmt(rows[-1][0])})" if rows else ""))
    if not rows:
        return

    def ops(p, g):
        e = p.get(g) or {}
        return e.get("OP1_V"), e.get("OP2_V")

    # each electrode's starting level = median of its first 30 readings in the period
    base = {}
    for g in GASES:
        for k in (0, 1):
            vals = [v for v in (ops(p, g)[k] for _, p in rows) if isinstance(v, (int, float))][:30]
            vals.sort()
            base[(g, k)] = vals[len(vals) // 2] if vals else None
    print("Starting level (median of the first readings), OP1 / OP2:")
    for g in GASES:
        b1, b2 = base[(g, 0)], base[(g, 1)]
        print(f"   {g:4s} {b1 if b1 is None else round(b1, 4)} / {b2 if b2 is None else round(b2, 4)} V")

    def moved(g, k, v):
        b = base[(g, k)]
        return isinstance(v, (int, float)) and b is not None and abs(v - b) > JUMP

    # 1. per day: OP1 / OP2 range for each gas
    print(f"\n1) Electrode voltages per day (OP1 min-max | OP2 min-max), '!' = moved more than {JUMP} V from its starting level")
    days_seen: dict = {}
    for ts, p in rows:
        d = time.strftime("%Y-%m-%d", time.localtime(ts))
        for g in GASES:
            a, b = ops(p, g)
            for k, v in (("op1", a), ("op2", b)):
                if isinstance(v, (int, float)):
                    days_seen.setdefault(d, {}).setdefault((g, k), []).append(v)
    print("   day         " + "  ".join(f"{g:^27s}" for g in GASES))
    for d, vals in days_seen.items():
        cells = []
        for g in GASES:
            parts = []
            for k in ("op1", "op2"):
                v = vals.get((g, k)) or []
                kk = 0 if k == "op1" else 1
                bad = "!" if v and (moved(g, kk, min(v)) or moved(g, kk, max(v))) else " "
                parts.append(f"{min(v):.3f}-{max(v):.3f}{bad}" if v else "      —      ")
            cells.append(" | ".join(parts))
        print(f"   {d}  " + "  ".join(cells))

    # 2. the moment each gas left the band
    print(f"\n2) When each electrode first moved more than {JUMP} V from its starting level")
    for g in GASES:
        hit = next((i for i, (ts, p) in enumerate(rows) if moved(g, 0, ops(p, g)[0]) or moved(g, 1, ops(p, g)[1])), None)
        if hit is None:
            print(f"   {g}: steady")
            continue
        print(f"   {g}: changed at {_fmt(rows[hit][0])}")
        for ts, p in rows[max(0, hit - 4): hit + 5]:
            a, b = ops(p, g)
            print(f"      {_fmt(ts)}  OP1 {a}  OP2 {b}  cal={p.get('cal', '-')}")

    # 3. gaps: the reader (or the whole logger) was off -> sensors may need time to stabilise
    print("\n3) Gaps of more than 10 minutes between readings (reader stopped or power off)")
    gaps = [(rows[i - 1][0], rows[i][0]) for i in range(1, len(rows)) if rows[i][0] - rows[i - 1][0] > 600]
    for a, b in gaps[-15:]:
        print(f"   {_fmt(a)} -> {_fmt(b)}  ({(b - a) / 60:.0f} min)")
    if not gaps:
        print("   none")

    # 4. calibration records and resets
    print("\n4) Calibration records")
    try:
        for ts, kind, level, by, data in con.execute(
                "SELECT ts, kind, level, by_user, json_remove(data, '$.data') FROM calibrations "
                "WHERE ts >= ? ORDER BY ts", (since,)):
            gases = ", ".join(json.loads(data).get("gases", []))
            print(f"   {_fmt(ts)}  {kind:5s} {gases:22s} level={level:12s} by={by}")
    except sqlite3.Error as e:
        print(f"   ({e})")

    # 5. boots, reader starts, power
    print("\n5) Boots (power cycles)")
    print("   " + "\n   ".join(_run(["journalctl", "--list-boots", "--no-pager"]).strip().splitlines()[-8:]))
    print("\n6) Gas reader starts")
    starts = [l for l in _run(["journalctl", "-u", "gas-monitor.service", "--since", f"{int(days)} days ago",
                                "--no-pager", "-o", "short-iso"]).splitlines() if "4-Gas Monitor" in l]
    print("   " + ("\n   ".join(starts[-15:]) if starts else "none found (may need: sudo, or the journal was cleared)"))
    print("\n7) Pi power / throttling flags (0x0 = never under-voltage)")
    print("   " + _run(["vcgencmd", "get_throttled"]).strip())


def adc() -> None:
    """Read all 8 ADC inputs directly, bypassing the gas reader and the calibration."""
    import board
    import busio
    import adafruit_ads1x15.ads1015 as ADS1015
    import adafruit_ads1x15.ads1115 as ADS1115
    from adafruit_ads1x15.analog_in import AnalogIn

    wiring = [("ADS1115 0x49", "CO", 0, 1), ("ADS1115 0x49", "OX", 2, 3),
              ("ADS1015 0x48", "NO2", 0, 1), ("ADS1015 0x48", "SO2", 2, 3)]
    i2c = busio.I2C(board.SCL, board.SDA)
    found = []
    if i2c.try_lock():
        try:
            found = i2c.scan()
        finally:
            i2c.unlock()
    print("I2C devices:", ", ".join(f"0x{a:02x}" for a in found) or "none")
    chips = {"ADS1115 0x49": ADS1115.ADS1115(i2c, address=0x49, gain=2 / 3),
             "ADS1015 0x48": ADS1015.ADS1015(i2c, address=0x48, gain=2 / 3)}
    print("\nchip           gas  input  ADC volts (mean, min-max of 32)   x2 (as the portal shows)")
    for chip, gas, we, ae in wiring:
        for name, ch in (("WE/OP1", we), ("AE/OP2", ae)):
            pin = AnalogIn(chips[chip], ch)
            vals = []
            for _ in range(32):
                vals.append(pin.voltage)
                time.sleep(0.01)
            m = sum(vals) / len(vals)
            print(f"{chip}  {gas:4s} A{ch} {name}  {m:7.4f} V ({min(vals):.4f}-{max(vals):.4f})     {2 * m:.4f} V")
    print("\nAlphasense typical zero at the ISB pins: CO 330/340 mV, NO2 230/230, O3(OX) 240/230, SO2 330/340.")
    print("Compare the 'ADC volts' with a multimeter on each ISB OP1/OP2 pin (to GND).")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "adc":
        adc()
    else:
        history(float(sys.argv[1]) if len(sys.argv) > 1 else 7.0)
