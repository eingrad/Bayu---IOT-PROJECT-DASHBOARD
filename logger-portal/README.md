# Bayu Logger — Local Settings Portal

A local web portal, served **by the Raspberry Pi itself**, to commission and
maintain one logger from a browser on the same network — no SSH, no cloud.

```
Browser  ──HTTP/WS──▶  FastAPI portal (app.py)  ──reads/writes──▶  config.yaml
                                │                                       ▲
                                │ systemctl restart                     │ loads
                                ▼                                       │
                         reader.py (gas-monitor.service) ──────────────┘
                                │ writes latest reading + appends every reading
                                ▼
                         status_file  ──streamed to the Live view
                         data/bayu.db ──History + Calibration charts (SQLite)
```

**One config, one source of truth:** the portal edits `config.yaml`, the reader
loads it, and a service restart applies changes.

### Data sources on this device
| Stream | Produced by | Configured in the portal via |
|--------|-------------|------------------------------|
| **Gas** (CO/SO₂/NO₂/O₃) | Python reader — `gas-monitor.service` | Calibration + Gas tabs (`config.yaml`) |
| **Particulate + Weather** | **Node-RED flows** (`mqtt out`) | inside Node-RED (portal restarts it / edits the broker connection) |
| **MQTT broker** | **HiveMQ Cloud** (external) | Broker tab — edits the Node-RED `mqtt-broker` connection node |

The portal subscribes to a **configurable** broker (`live_broker`; blank host = the
same broker as the gas reader, i.e. HiveMQ) so the **Live** tab shows all three
streams even though they come from different sources. Set the host/port/TLS/creds
in the Broker tab to point it anywhere.

### Local history (SQLite on the SD card)
Every reading is saved on the Pi in `data/bayu.db` (next to `config.yaml`; set
`storage.db_path` to move it), so you can see and download data from the portal
with no internet:

| Stream | Saved by | Offline? |
|--------|----------|----------|
| **Gas** | `reader.py`, right after each sample, before publishing | ✓ keeps saving with no network |
| **Particulate + Weather** | the portal, as each message arrives on the live broker | only while the portal can reach that broker; point Node-RED and the portal at the local broker to record through an internet outage |

* One row per reading, stored as the JSON that was published, so new fields are
  recorded automatically. Gas also arriving over MQTT is recognised by its
  timestamp and not stored twice.
* Readings older than `storage.retention_days` (default 90; 0 = forever) are
  deleted hourly. Change it in **History → Local storage**.
* Gas at the default 20 s interval is about 1.5 MB/day (≈ 135 MB for 90 days).

## v1 scope
| Tab | Does |
|-----|------|
| **Overview** | Health: service state, uptime, CPU temp, storage, I²C devices, last-report age |
| **Live & Diagnostics** | Real-time readings incl. raw electrode voltages; I²C bus scan |
| **History** | Charts + table of saved readings (gas / particulate / weather), time-range picker, CSV download, retention setting |
| **Calibration** | Per-sensor charts of WE/AE electrode voltages and concentration (with spread, drift and a zero line), zero-calibration wizard (runs `zero_cal.py`), per-sensor sensitivity/zeros/thresholds |
| **Connectivity** | MQTT broker settings + **Test connection** |
| **System** | Start/stop/restart reader, sampling settings, live log viewer |

## Files
| File | Purpose |
|------|---------|
| `config.yaml` | Shared device settings (portal + reader) |
| `config.py` | Atomic load/save + deep-merge |
| `app.py` | FastAPI REST + WebSocket + serves the UI |
| `reader.py` | Config-driven refactor of `BAYU_SENSE_READER.py` |
| `storage.py` | Local SQLite history (shared by the reader and the portal) |
| `data/bayu.db` | The history database, created on first run (git-ignored) |
| `static/index.html` | Self-contained portal UI (no build step, offline) |
| `bayu-portal.service` | systemd unit for the portal |
| `requirements.txt` | Python deps |

## Run locally (any machine, for development)
The app fails soft when no Pi hardware is present, so you can develop the UI on
your laptop:
```bash
cd logger-portal
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
# open http://localhost:8000
```
Overview/Live show "unavailable/no data" (no sensors), but config editing,
MQTT test, and the whole UI work.

## Deploy on the Raspberry Pi
```bash
sudo mkdir -p /opt/bayu-portal && sudo chown bayu:bayu /opt/bayu-portal
cp -r logger-portal/* /opt/bayu-portal/
cd /opt/bayu-portal
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt

# Let the 'bayu' user control the reader AND Node-RED services without a password:
echo 'bayu ALL=(root) NOPASSWD: \
/bin/systemctl start gas-monitor.service, /bin/systemctl stop gas-monitor.service, /bin/systemctl restart gas-monitor.service, \
/bin/systemctl start nodered.service, /bin/systemctl stop nodered.service, /bin/systemctl restart nodered.service' \
| sudo tee /etc/sudoers.d/bayu-portal

sudo cp bayu-portal.service /etc/systemd/system/
sudo systemctl enable --now bayu-portal.service
```

### Reach it by name (mDNS)
```bash
sudo apt install -y avahi-daemon
# now visit  http://<pi-hostname>.local/   from any device on the LAN
```

### Point the reader at this config
Run `reader.py` from `gas-monitor.service` (or symlink your existing
`BAYU_SENSE_READER.py` to this refactor). It reads `/opt/bayu-portal/config.yaml`
by default (override with the `BAYU_CONFIG` env var).

Gas history is only saved by this `reader.py`, so the old `BAYU_SENSE_READER.py`
won't fill the History tab (except gas copies the portal receives over MQTT).
Run `gas-monitor.service` as the **same user as the portal** (`User=` in
`bayu-portal.service`): both write to `data/bayu.db`, and a database created by
`root` can't be written by the portal user. If it already happened:
`sudo chown -R <portal-user>: <portal dir>/data`.

## Security notes (before production)
- Set a real password under `portal:` in `config.yaml` (empty = auth off).
- Put nginx in front with a **self-signed HTTPS** cert; bind portal to `127.0.0.1`
  and let nginx serve `0.0.0.0:443`.
- Keep it **LAN-only** (firewall the port off the internet).
- `zero_cal.py` must accept `--json` and print the new zeros as the last line,
  e.g. `{"co":{"we_zero_v":0.33,"ae_zero_v":0.28}, ...}`.

## Not in v1 (good next steps)
WiFi/network config UI · store-and-forward (re-send saved readings to the cloud after an outage) · OTA update ·
config backup/restore · role-based access · first-boot wizard.
