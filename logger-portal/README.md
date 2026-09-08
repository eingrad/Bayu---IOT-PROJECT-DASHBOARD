# Bayu Logger — Local Settings Portal

A local web portal, served **by the Raspberry Pi itself**, to commission and
maintain one logger from a browser on the same network — no SSH, no cloud.

```
Browser  ──HTTP/WS──▶  FastAPI portal (app.py)  ──reads/writes──▶  config.yaml
                                │                                       ▲
                                │ systemctl restart                     │ loads
                                ▼                                       │
                         reader.py (gas-monitor.service) ──────────────┘
                                │ writes latest reading
                                ▼
                         status_file  ──streamed to the Live view
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

## v1 scope
| Tab | Does |
|-----|------|
| **Overview** | Health: service state, uptime, CPU temp, storage, I²C devices, last-report age |
| **Live & Diagnostics** | Real-time readings incl. raw electrode voltages; I²C bus scan |
| **Calibration** | Zero-calibration wizard (runs `zero_cal.py`) + per-sensor sensitivity/zeros/thresholds |
| **Connectivity** | MQTT broker settings + **Test connection** |
| **System** | Start/stop/restart reader, sampling settings, live log viewer |

## Files
| File | Purpose |
|------|---------|
| `config.yaml` | Shared device settings (portal + reader) |
| `config.py` | Atomic load/save + deep-merge |
| `app.py` | FastAPI REST + WebSocket + serves the UI |
| `reader.py` | Config-driven refactor of `BAYU_SENSE_READER.py` |
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

## Security notes (before production)
- Set a real password under `portal:` in `config.yaml` (empty = auth off).
- Put nginx in front with a **self-signed HTTPS** cert; bind portal to `127.0.0.1`
  and let nginx serve `0.0.0.0:443`.
- Keep it **LAN-only** (firewall the port off the internet).
- `zero_cal.py` must accept `--json` and print the new zeros as the last line,
  e.g. `{"co":{"we_zero_v":0.33,"ae_zero_v":0.28}, ...}`.

## Not in v1 (good next steps)
WiFi/network config UI · store-and-forward local buffering · OTA update ·
config backup/restore · role-based access · first-boot wizard.
