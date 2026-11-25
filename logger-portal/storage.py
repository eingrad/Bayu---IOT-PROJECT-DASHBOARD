"""
Local history for the Bayu logger — one SQLite file on the Pi's SD card.

Every reading is appended to a single `readings` table, one row per report,
with the report kept exactly as it was published (JSON). That way any field a
sensor or Node-RED flow adds later is recorded without a schema change.

Who writes what:
* reader.py  -> "gas" rows, straight after each sample (works with no network).
* app.py     -> "particulate" + "weather" rows from its MQTT subscriber, plus
                "gas" rows from MQTT as a fallback. Duplicate gas rows are
                dropped by the UNIQUE(stream, ts) index, so both writers can run.

Both processes open the same file; WAL mode lets the portal read history while
the reader is writing. Every function here fails soft — a storage problem must
never stop the reader from publishing.
"""
from __future__ import annotations

import csv
import io
import json
import math
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator, Optional

from config import CONFIG_PATH

STREAMS = ("gas", "particulate", "weather")
DEFAULT_DB_PATH = "data/bayu.db"
DEFAULT_RETENTION_DAYS = 90
GAS_TS_FORMAT = "%Y-%m-%d %H:%M:%S"  # reader.py's report["timestamp"]
FIELD_SEP = "/"  # nested keys are joined with "/" ("CO/CO_ppm"); "." appears in "PM2.5"

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id      INTEGER PRIMARY KEY,
    stream  TEXT    NOT NULL,   -- gas | particulate | weather
    ts      INTEGER NOT NULL,   -- unix seconds (UTC) when the reading was taken
    payload TEXT    NOT NULL    -- the report as published (JSON)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_readings_stream_ts ON readings(stream, ts);
"""


# --------------------------------------------------------------------------
# Opening the store
# --------------------------------------------------------------------------
def storage_settings(cfg: dict) -> dict:
    s = (cfg or {}).get("storage") or {}
    path = Path(s.get("db_path") or DEFAULT_DB_PATH).expanduser()
    if not path.is_absolute():
        path = CONFIG_PATH.parent / path  # relative to config.yaml
    try:
        retention = int(s.get("retention_days", DEFAULT_RETENTION_DAYS) or 0)
    except (TypeError, ValueError):
        retention = DEFAULT_RETENTION_DAYS
    return {
        "enabled": bool(s.get("enabled", True)),
        "path": path,
        "retention_days": max(0, retention),
    }


class Store:
    """Thin wrapper around the SQLite file. Each call opens its own short-lived
    connection, so one Store can be shared by FastAPI worker threads and the
    paho-mqtt network thread without locking."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self._init_lock = threading.Lock()
        self._ready = False

    # -- connection -------------------------------------------------------
    def _connect(self) -> sqlite3.Connection:
        if not self._ready:
            with self._init_lock:
                if not self._ready:
                    self.path.parent.mkdir(parents=True, exist_ok=True)
                    conn = sqlite3.connect(self.path, timeout=10)
                    try:
                        conn.execute("PRAGMA journal_mode=WAL")
                        conn.executescript(SCHEMA)
                        conn.commit()
                    finally:
                        conn.close()
                    self._ready = True
        # check_same_thread=False: a streamed CSV export is iterated from
        # whichever worker thread Starlette picks; each connection still has
        # exactly one user at a time.
        conn = sqlite3.connect(self.path, timeout=10, check_same_thread=False)
        conn.execute("PRAGMA synchronous=NORMAL")  # safe with WAL, easier on the SD card
        return conn

    # -- writes -----------------------------------------------------------
    def insert(self, stream: str, ts: int, payload: dict) -> bool:
        """Append one reading. Returns False if (stream, ts) was already stored."""
        if stream not in STREAMS:
            raise ValueError(f"unknown stream {stream!r}")
        conn = self._connect()
        try:
            cur = conn.execute(
                "INSERT OR IGNORE INTO readings (stream, ts, payload) VALUES (?, ?, ?)",
                (stream, int(ts), json.dumps(payload, separators=(",", ":"))),
            )
            conn.commit()
            return cur.rowcount == 1
        finally:
            conn.close()

    def prune(self, retention_days: int, batch: int = 5000) -> int:
        """Delete readings older than `retention_days` (0 = keep forever).
        Deletes in batches so the reader is never locked out for long."""
        if not retention_days or retention_days <= 0:
            return 0
        cutoff = int(time.time()) - int(retention_days) * 86400
        removed = 0
        conn = self._connect()
        try:
            while True:
                cur = conn.execute(
                    "DELETE FROM readings WHERE id IN "
                    "(SELECT id FROM readings WHERE ts < ? LIMIT ?)",
                    (cutoff, batch),
                )
                conn.commit()
                removed += cur.rowcount
                if cur.rowcount < batch:
                    return removed
        finally:
            conn.close()

    # -- reads ------------------------------------------------------------
    def last_ts(self) -> dict:
        """Newest timestamp per stream (cheap: walks the unique index)."""
        conn = self._connect()
        try:
            return {
                s: conn.execute(
                    "SELECT MAX(ts) FROM readings WHERE stream = ?", (s,)
                ).fetchone()[0]
                for s in STREAMS
            }
        finally:
            conn.close()

    def summary(self) -> dict:
        conn = self._connect()
        try:
            streams = {}
            for s in STREAMS:
                count, first, last = conn.execute(
                    "SELECT COUNT(*), MIN(ts), MAX(ts) FROM readings WHERE stream = ?", (s,)
                ).fetchone()
                recent = [
                    json.loads(r[0])
                    for r in conn.execute(
                        "SELECT payload FROM readings WHERE stream = ? "
                        "ORDER BY ts DESC LIMIT 50",
                        (s,),
                    )
                ]
                streams[s] = {
                    "count": count,
                    "first_ts": first,
                    "last_ts": last,
                    "fields": numeric_fields(recent),
                }
        finally:
            conn.close()
        return {"size_bytes": self.size_bytes(), "streams": streams}

    def size_bytes(self) -> int:
        total = 0
        for suffix in ("", "-wal", "-shm"):
            try:
                total += Path(str(self.path) + suffix).stat().st_size
            except OSError:
                pass
        return total

    def rows(self, stream: str, start: int, end: int, limit: int = 50, offset: int = 0):
        """Raw readings in [start, end), newest first, plus the total count."""
        conn = self._connect()
        try:
            total = conn.execute(
                "SELECT COUNT(*) FROM readings WHERE stream = ? AND ts >= ? AND ts < ?",
                (stream, start, end),
            ).fetchone()[0]
            rows = [
                {"ts": ts, "data": json.loads(payload)}
                for ts, payload in conn.execute(
                    "SELECT ts, payload FROM readings "
                    "WHERE stream = ? AND ts >= ? AND ts < ? "
                    "ORDER BY ts DESC LIMIT ? OFFSET ?",
                    (stream, start, end, limit, offset),
                )
            ]
        finally:
            conn.close()
        return {"total": total, "rows": rows}

    def series(self, stream: str, start: int, end: int, fields: list, points: int = 600):
        """Chart data: readings bucketed into at most `points` time slots, with
        the mean, min and max of each field per slot. When the range is short
        enough every slot holds one reading, i.e. the raw data."""
        conn = self._connect()
        try:
            # Size the slots to the span that actually has data, so a recording
            # that started recently isn't averaged as if it covered the whole range.
            first = conn.execute(
                "SELECT MIN(ts) FROM readings WHERE stream = ? AND ts >= ? AND ts < ?",
                (stream, start, end),
            ).fetchone()[0]
        finally:
            conn.close()
        if first is not None:
            start = max(start, first)
        bucket = max(1, math.ceil((end - start) / max(1, points)))
        cols, params = [], []
        for i, key in enumerate(fields):
            cols.append(f"json_extract(payload, ?) AS f{i}")
            params.append(json_path(key))
        aggs = []
        for i in range(len(fields)):
            num = f"(CASE WHEN typeof(f{i}) IN ('integer','real') THEN f{i} END)"
            aggs += [f"AVG({num})", f"MIN({num})", f"MAX({num})"]
        sql = (
            f"SELECT CAST(AVG(ts) AS INTEGER) AS t, COUNT(*) AS n"
            f"{''.join(', ' + a for a in aggs)} "
            f"FROM (SELECT ts{''.join(', ' + c for c in cols)} FROM readings "
            f"      WHERE stream = ? AND ts >= ? AND ts < ?) "
            f"GROUP BY (ts - ?) / ? ORDER BY t"
        )
        conn = self._connect()
        try:
            out = conn.execute(sql, (*params, stream, start, end, start, bucket)).fetchall()
        finally:
            conn.close()
        series = {k: {"avg": [], "min": [], "max": []} for k in fields}
        for row in out:
            for i, key in enumerate(fields):
                avg, lo, hi = row[2 + 3 * i: 5 + 3 * i]
                series[key]["avg"].append(avg)
                series[key]["min"].append(lo)
                series[key]["max"].append(hi)
        return {
            "bucket_s": bucket,
            "t": [r[0] for r in out],
            "n": [r[1] for r in out],
            "series": series,
        }

    def iter_payloads(self, stream: str, start: int, end: int) -> Iterator[tuple]:
        """Yield (ts, payload dict) oldest first — used by the CSV export."""
        conn = self._connect()
        try:
            for ts, payload in conn.execute(
                "SELECT ts, payload FROM readings "
                "WHERE stream = ? AND ts >= ? AND ts < ? ORDER BY ts",
                (stream, start, end),
            ):
                yield ts, json.loads(payload)
        finally:
            conn.close()


_stores: dict = {}
_stores_lock = threading.Lock()


def open_store(cfg: dict) -> Optional[Store]:
    """The Store for this config, or None when storage is disabled."""
    s = storage_settings(cfg)
    if not s["enabled"]:
        return None
    with _stores_lock:
        st = _stores.get(s["path"])
        if st is None:
            st = _stores[s["path"]] = Store(s["path"])
        return st


# --------------------------------------------------------------------------
# Payload helpers
# --------------------------------------------------------------------------
def flatten(obj, prefix: str = "") -> dict:
    """{"CO": {"CO_ppm": 0.4}} -> {"CO/CO_ppm": 0.4}. Lists are kept as JSON."""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}{FIELD_SEP}{k}" if prefix else str(k)
            if isinstance(v, dict):
                out.update(flatten(v, key))
            else:
                out[key] = json.dumps(v) if isinstance(v, list) else v
    return out


def numeric_fields(payloads: Iterable[dict]) -> list:
    """Numeric leaf keys seen across these payloads, in first-seen order."""
    seen = {}
    for p in payloads:
        for k, v in flatten(p).items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                seen.setdefault(k, None)
    return list(seen)


def json_path(key: str) -> str:
    """"CO/CO_ppm" -> '$."CO"."CO_ppm"' (quoted, so keys like "PM2.5" work)."""
    parts = key.split(FIELD_SEP)
    if not key or any((not p) or ('"' in p) for p in parts):
        raise ValueError(f"bad field {key!r}")
    return "$" + "".join(f'."{p}"' for p in parts)


def reading_ts(payload: dict, received: Optional[float] = None) -> int:
    """When a reading was taken. Uses the payload's own `timestamp` if it has a
    sensible one (reader.py's local "%Y-%m-%d %H:%M:%S", ISO-8601, or epoch
    s/ms); otherwise the time it was received."""
    now = time.time() if received is None else received
    ts = None
    raw = payload.get("timestamp") if isinstance(payload, dict) else None
    try:
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            ts = raw / 1000.0 if raw > 1e12 else float(raw)
        elif isinstance(raw, str) and raw.strip():
            raw = raw.strip()
            try:
                ts = time.mktime(time.strptime(raw, GAS_TS_FORMAT))  # device local time
            except ValueError:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                ts = dt.timestamp()  # naive ISO = device local time
    except (ValueError, OverflowError, OSError):
        ts = None
    # A wildly wrong clock in the payload shouldn't file the reading years away.
    if ts is None or abs(ts - now) > 86400:
        ts = now
    return int(ts)


def csv_chunks(rows: Iterable[tuple], tz=None, header_rows: int = 500) -> Iterator[str]:
    """Stream (ts, payload) rows as CSV text. Columns are the union of keys in
    the first `header_rows` readings; keys that only appear later are added
    as a trailing JSON `extra` column so nothing is lost."""
    rows = iter(rows)
    head = []
    for r in rows:
        head.append(r)
        if len(head) >= header_rows:
            break
    keys: dict = {}
    for _, p in head:
        for k in flatten(p):
            keys.setdefault(k, None)
    keys.pop("timestamp", None)  # the time columns below replace it
    cols = list(keys)

    buf = io.StringIO()
    w = csv.writer(buf)

    def take():
        s = buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        return s

    w.writerow(["time", "unix_ts", *cols, "extra"])
    yield take()

    def line(ts, payload):
        flat = flatten(payload)
        flat.pop("timestamp", None)
        extra = {k: v for k, v in flat.items() if k not in keys}
        when = datetime.fromtimestamp(ts, tz)  # tz None = the Pi's local time
        w.writerow([
            when.strftime(GAS_TS_FORMAT),
            ts,
            *[("" if flat.get(c) is None else flat.get(c)) for c in cols],
            json.dumps(extra) if extra else "",
        ])

    n = 0
    for ts, payload in head:
        line(ts, payload)
    yield take()
    for ts, payload in rows:
        line(ts, payload)
        n += 1
        if n % 1000 == 0:
            yield take()
    yield take()
