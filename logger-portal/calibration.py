"""
Layered gas calibration for the Bayu logger.

Every calibration value has up to three levels, highest first:

    user          the client's own calibration (optional)
    manufacturer  Bayu's calibration before delivery
    factory       sensor datasheet values; always complete, read-only on the Pi

The reader uses the highest level that has a value. A higher level overrides
the ones below it and never deletes them, so "reset to manufacturer" simply
clears the user level for that gas.

Files live in calibration/ next to config.yaml (override with BAYU_CAL_DIR):

    factory.yaml  manufacturer.yaml  user.yaml

Each file maps gas -> group -> value:

    zero : [WE0, AE0]   clean-air electrode zeros, raw ADC volts before the
                        board's x2 divider (same convention as before)
    sens : signed WE sensitivity, mV/ppm (CO, SO2 positive; OX, NO2 negative)
    op1  : [m1, c1]     WE = m1 * OP1 + c1        (volts)
    op2  : [m2, c2]     AE = m2 * OP2 + c2        (volts)
    out  : [m3, c3]     final = m3 * reading + c3 (ppm for CO, ppb otherwise)
    o3   : {out: [m4, c4]}   O3 = m4 * max(0, OX - NO2) + c4

With every m = 1 and c = 0 the result is exactly the original Alphasense
formula, so readings don't change until someone calibrates.

Used by both the gas reader (4_gas_reader.py) and the portal (app.py), so the
two can never disagree.  Run on the Pi once, to create the files:

    python3 calibration.py init      # also moves zeros/sensitivity out of config.yaml
    python3 calibration.py show
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import sys
import threading
from pathlib import Path
from typing import Optional

import yaml

from config import CONFIG_PATH

DIVIDER_RATIO = 2.0  # 2x 4.7k divider on each analog line (hardware, fixed)
GASES = ("co", "ox", "no2", "so2")
ALL = GASES + ("o3",)
LEVELS = ("user", "manufacturer", "factory")  # highest first
WRITABLE = ("user", "manufacturer")
UNIT = {"co": "ppm", "ox": "ppb", "no2": "ppb", "so2": "ppb", "o3": "ppb"}
NAME = {"co": "CO", "ox": "OX", "no2": "NO2", "so2": "SO2", "o3": "O3"}  # keys in the published report
SIGN = {"co": 1, "so2": 1, "ox": -1, "no2": -1}
SIGN_WHY = {
    1: "it is oxidised at the working electrode, so its signal rises with gas",
    -1: "it is reduced at the working electrode, so its signal falls as gas rises",
}
PAIR_GROUPS = ("zero", "op1", "op2", "out")

CAL_DIR = Path(os.environ.get("BAYU_CAL_DIR", CONFIG_PATH.parent / "calibration"))

IDENTITY = [1.0, 0.0]
BUILT_IN_FACTORY = {
    "co": {"zero": [0.330, 0.340], "sens": 336.0, "op1": IDENTITY, "op2": IDENTITY, "out": IDENTITY},
    "ox": {"zero": [0.240, 0.230], "sens": -216.0, "op1": IDENTITY, "op2": IDENTITY, "out": IDENTITY},
    "no2": {"zero": [0.230, 0.230], "sens": -165.0, "op1": IDENTITY, "op2": IDENTITY, "out": IDENTITY},
    "so2": {"zero": [0.330, 0.340], "sens": 240.0, "op1": IDENTITY, "op2": IDENTITY, "out": IDENTITY},
    "o3": {"out": IDENTITY},
}

_write_lock = threading.Lock()


class CalibrationError(ValueError):
    pass


def groups_for(gas: str) -> tuple:
    return ("out",) if gas == "o3" else ("zero", "sens", "op1", "op2", "out")


# --------------------------------------------------------------------------
# Checking values
# --------------------------------------------------------------------------
def _num(v) -> float:
    if isinstance(v, bool):
        raise CalibrationError("must be a number")
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise CalibrationError("must be a number")
    if not math.isfinite(f):
        raise CalibrationError("must be a finite number")
    return f


def normalise(gas: str, group: str, value):
    """Return the value in canonical form, or raise CalibrationError with a
    message a person can act on."""
    if gas not in ALL:
        raise CalibrationError(f"unknown gas {gas!r}")
    if group not in groups_for(gas):
        raise CalibrationError(f"{NAME[gas]} has no {group!r} setting")
    if group == "sens":
        s = _num(value)
        if s == 0:
            raise CalibrationError(f"{NAME[gas]} sensitivity can't be 0")
        want = SIGN[gas]
        if (s > 0) != (want > 0):
            raise CalibrationError(
                f"{NAME[gas]} sensitivity must be {'positive' if want > 0 else 'negative'}: {SIGN_WHY[want]}"
            )
        return s
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise CalibrationError(f"{NAME[gas]} {group} needs two numbers")
    a, b = _num(value[0]), _num(value[1])
    if group == "zero":
        for v in (a, b):
            if not 0 < v < 3.3:
                raise CalibrationError(f"{NAME[gas]} zero {v} V is outside 0-3.3 V")
        return [a, b]
    if a <= 0:
        raise CalibrationError(f"{NAME[gas]} {group} gain m must be positive; keep the sign in the sensitivity")
    return [a, b]


def warnings_for(gas: str, group: str, value) -> list:
    """Allowed, but probably a mistake."""
    if group in ("op1", "op2", "out") and not 0.5 <= value[0] <= 2.0:
        return [f"{NAME[gas]} {group} gain {value[0]:.3f} is far from 1"]
    return []


# --------------------------------------------------------------------------
# Files
# --------------------------------------------------------------------------
def level_path(level: str) -> Path:
    return CAL_DIR / f"{level}.yaml"


def session_path() -> Path:
    """Written by the portal while a calibration runs; the reader samples faster."""
    return CAL_DIR / "session.json"


def mtimes() -> tuple:
    """Changes whenever a level file changes (the reader reloads on change)."""
    out = []
    for lv in LEVELS:
        try:
            out.append(level_path(lv).stat().st_mtime_ns)
        except OSError:
            out.append(None)
    return tuple(out)


def _read_level(level: str, errors: list) -> dict:
    path = level_path(level)
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except FileNotFoundError:
        if level == "factory":
            errors.append("factory.yaml not found: using the built-in factory values")
        return {}
    except Exception as e:
        errors.append(f"{path.name} can't be read ({e}); ignoring it")
        return {}
    if not isinstance(raw, dict):
        errors.append(f"{path.name} is not a gas -> setting map; ignoring it")
        return {}
    out = {}
    for gas, groups in raw.items():
        if gas not in ALL or not isinstance(groups, dict):
            errors.append(f"{path.name}: unknown entry {gas!r} ignored")
            continue
        for group, value in groups.items():
            try:
                out.setdefault(gas, {})[group] = normalise(gas, group, value)
            except CalibrationError as e:
                errors.append(f"{path.name}: {e} (ignored)")
    return out


class Calibration:
    """A snapshot of the three levels."""

    def __init__(self, layers: dict, errors: list):
        self.layers = layers
        self.errors = errors

    def resolve(self, gas: str, group: str):
        for lv in LEVELS:
            v = self.layers[lv].get(gas, {}).get(group)
            if v is not None:
                return v, lv
        raise CalibrationError(f"no value for {gas}.{group}")  # factory is always complete

    def params(self, gas: str) -> dict:
        return {g: self.resolve(gas, g)[0] for g in groups_for(gas)}

    def effective(self) -> dict:
        return {gas: self.params(gas) for gas in ALL}

    @property
    def version(self) -> str:
        """Short id of the values in use; each reading carries it as "cal"."""
        blob = json.dumps(self.effective(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha1(blob.encode()).hexdigest()[:8]

    def table(self, gases=ALL, groups=None) -> dict:
        out = {}
        for gas in gases:
            out[gas] = {}
            for group in groups_for(gas):
                if groups is not None and group not in groups:
                    continue
                value, lv = self.resolve(gas, group)
                out[gas][group] = {
                    "value": value,
                    "level": lv,
                    "levels": {L: self.layers[L].get(gas, {}).get(group) for L in LEVELS},
                }
        return out


def load() -> Calibration:
    errors: list = []
    layers = {lv: _read_level(lv, errors) for lv in LEVELS}
    # "Cannot be missing": fill any gap in the factory level from the built-in values.
    factory = layers["factory"]
    for gas in ALL:
        for group in groups_for(gas):
            if factory.get(gas, {}).get(group) is None:
                factory.setdefault(gas, {})[group] = copy.deepcopy(BUILT_IN_FACTORY[gas][group])
                if level_path("factory").exists():
                    errors.append(f"factory.yaml has no {gas}.{group}: using the built-in value")
    return Calibration(layers, errors)


def _write_yaml(path: Path, data: dict, header: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    body = yaml.safe_dump(data, sort_keys=False, default_flow_style=None) if data else "{}\n"
    tmp.write_text(header + body, encoding="utf-8")
    os.replace(tmp, path)


HEADERS = {
    "factory": "# Factory level: sensor datasheet values. Must be complete. Keep read-only.\n",
    "manufacturer": "# Manufacturer level: Bayu's calibration. Written by the portal's manufacturer login.\n",
    "user": "# User level: the client's own calibration. Clear it to fall back to the manufacturer level.\n",
}


def set_values(level: str, gas: str, changes: dict) -> None:
    """changes: group -> value (set) or None (clear). Factory can't be written."""
    if level not in WRITABLE:
        raise CalibrationError(f"the {level} level can't be changed from the portal")
    clean = {g: (None if v is None else normalise(gas, g, v)) for g, v in changes.items()}
    with _write_lock:
        errors: list = []
        data = _read_level(level, errors)
        cur = data.setdefault(gas, {})
        for g, v in clean.items():
            if v is None:
                cur.pop(g, None)
            else:
                cur[g] = v
        if not cur:
            data.pop(gas, None)
        _write_yaml(level_path(level), data, HEADERS[level])


def clear_gas(level: str, gas: str) -> dict:
    """Remove every value of one gas at one level; returns what was removed."""
    if level not in WRITABLE:
        raise CalibrationError(f"the {level} level can't be changed from the portal")
    with _write_lock:
        errors: list = []
        data = _read_level(level, errors)
        removed = data.pop(gas, {})
        _write_yaml(level_path(level), data, HEADERS[level])
    return removed


# --------------------------------------------------------------------------
# The calculation
# --------------------------------------------------------------------------
def compute(gas: str, p: dict, op1_v: float, op2_v: float) -> dict:
    """OP1/OP2 are the electrode voltages after the divider (as published)."""
    m1, c1 = p["op1"]
    m2, c2 = p["op2"]
    we = m1 * op1_v + c1
    ae = m2 * op2_v + c2
    signal = (we - p["zero"][0] * DIVIDER_RATIO) - (ae - p["zero"][1] * DIVIDER_RATIO)
    ppm = signal * 1000.0 / p["sens"]
    raw = ppm * 1000.0 if UNIT[gas] == "ppb" else ppm
    m3, c3 = p["out"]
    return {"we": we, "ae": ae, "signal_v": signal, "raw": raw, "value": m3 * raw + c3}


def compute_o3(p_o3: dict, ox_ppb: float, no2_ppb: float) -> float:
    m4, c4 = p_o3["out"]
    return m4 * max(0.0, ox_ppb - no2_ppb) + c4


def zero_from(p: dict, op1s: list, op2s: list) -> list:
    """New clean-air zeros from electrode voltages measured in zero air."""
    if not op1s or not op2s:
        raise CalibrationError("no readings to calculate the zero from")
    m1, c1 = p["op1"]
    m2, c2 = p["op2"]
    we = sum(m1 * v + c1 for v in op1s) / len(op1s)
    ae = sum(m2 * v + c2 for v in op2s) / len(op2s)
    return [round(we / DIVIDER_RATIO, 6), round(ae / DIVIDER_RATIO, 6)]


def span_from(p: dict, pre_value: float, target: float) -> list:
    """New output gain so that the span gas reads its certified value.
    pre_value is the reading (after the current output correction)."""
    m3, c3 = p["out"]
    raw = (pre_value - c3) / m3
    if raw <= 0:
        raise CalibrationError("the reading in span gas is zero or negative; check the gas is flowing and the zero")
    m = (target - c3) / raw
    if m <= 0:
        raise CalibrationError("the calculated gain is not positive; check the cylinder value")
    return [round(m, 6), c3]


# --------------------------------------------------------------------------
# One-off setup on the Pi
# --------------------------------------------------------------------------
def init(config_path: Path = CONFIG_PATH) -> list:
    """Create the level files. The zeros and sensitivities currently in
    config.yaml become the manufacturer level (where they differ from the
    factory values), and are then removed from config.yaml so there is one
    source of truth. Never overwrites existing level files."""
    msgs = []
    CAL_DIR.mkdir(parents=True, exist_ok=True)
    if not level_path("factory").exists():
        _write_yaml(level_path("factory"), copy.deepcopy(BUILT_IN_FACTORY), HEADERS["factory"])
        msgs.append(f"created {level_path('factory')}")
    errs: list = []
    factory = _read_level("factory", errs)

    try:
        cfg = yaml.safe_load(Path(config_path).read_text(encoding="utf-8")) or {}
    except FileNotFoundError:
        cfg = {}
    sensors = cfg.get("sensors") or {}
    if not level_path("manufacturer").exists():
        mfr = {}
        for gas in GASES:
            s = sensors.get(gas) or {}
            vals = {}
            if s.get("we_zero_v") is not None and s.get("ae_zero_v") is not None:
                vals["zero"] = [float(s["we_zero_v"]), float(s["ae_zero_v"])]
            if s.get("sensitivity") is not None:
                vals["sens"] = float(s["sensitivity"])
            for group, v in vals.items():
                try:
                    v = normalise(gas, group, v)
                except CalibrationError as e:
                    msgs.append(f"skipped config.yaml {gas}.{group}: {e}")
                    continue
                if v != factory.get(gas, {}).get(group):
                    mfr.setdefault(gas, {})[group] = v
        _write_yaml(level_path("manufacturer"), mfr, HEADERS["manufacturer"])
        msgs.append(f"created {level_path('manufacturer')} from config.yaml ({', '.join(mfr) or 'no differences'})")
    if not level_path("user").exists():
        _write_yaml(level_path("user"), {}, HEADERS["user"])
        msgs.append(f"created {level_path('user')} (empty)")

    moved = False
    for gas in GASES:
        s = sensors.get(gas)
        if isinstance(s, dict):
            for k in ("sensitivity", "we_zero_v", "ae_zero_v"):
                if k in s:
                    s.pop(k)
                    moved = True
    if moved:
        from config import save_config  # same atomic writer the portal uses

        save_config(cfg)
        msgs.append("removed sensitivity/we_zero_v/ae_zero_v from config.yaml (now in calibration/)")
    try:
        os.chmod(level_path("factory"), 0o444)
    except OSError:
        pass
    return msgs


def _show() -> None:
    cal = load()
    for e in cal.errors:
        print("!", e)
    print(f"version {cal.version}")
    for gas, groups in cal.table().items():
        for group, row in groups.items():
            print(f"  {NAME[gas]:4s} {group:5s} {str(row['value']):24s} ({row['level']})")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "show"
    if cmd == "init":
        for m in init():
            print(m)
        _show()
    elif cmd == "show":
        _show()
    else:
        print(__doc__)
        sys.exit(2)
