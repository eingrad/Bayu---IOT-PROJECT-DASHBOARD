"""Load/save the shared config.yaml atomically."""
import os
import threading
from pathlib import Path

import yaml

CONFIG_PATH = Path(
    os.environ.get("BAYU_CONFIG", Path(__file__).resolve().parent / "config.yaml")
)
_lock = threading.Lock()


def load_config() -> dict:
    with _lock:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}


def save_config(cfg: dict) -> None:
    """Write atomically so a crash mid-write can't corrupt the config."""
    with _lock:
        tmp = CONFIG_PATH.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            yaml.safe_dump(cfg, f, sort_keys=False, default_flow_style=False)
        os.replace(tmp, CONFIG_PATH)


def deep_merge(base: dict, patch: dict) -> dict:
    """Recursively merge `patch` into a copy of `base` (patch wins)."""
    out = dict(base)
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out
