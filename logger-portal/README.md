# Bayu Logger — Local Settings Portal

A local web portal, served **by the Raspberry Pi itself**, to commission and
maintain one logger from a browser on the same network — no SSH, no cloud.

```
Browser  ──HTTP/WS──▶  FastAPI portal (app.py)  ──reads/writes──▶  config.yaml
                                │                                       ▲
                                │ systemctl restart                     │ loads
                                ▼                                       │
             4_gas_reader.py (gas-monitor.service) ─────────────┘
                     │  ▲ calibration/ (factory -> manufacturer -> user levels)
                     ▼
              data/bayu.db  ──History + Calibration tabs (SQLite)
```

**One config, one source of truth:** the portal edits `config.yaml` and the
calibration levels; the gas reader re-checks both every cycle.

### Data sources on this device
| Stream | Produced by | Configured in the portal via |
|--------|-------------|------------------------------|
| **Gas** (CO/SO₂/NO₂/O₃) | `gas-monitor/4_gas_reader.py` — `gas-monitor.service` | Calibration tab (`calibration/`) + System tab (`config.yaml`) |
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
| **Gas** | `4_gas_reader.py`, right after each sample, before publishing | ✓ keeps saving with no network |
| **Particulate + Weather** | the portal, as each message arrives on the live broker | only while the portal can reach that broker; point Node-RED and the portal at the local broker to record through an internet outage |

* One row per reading, stored as the JSON that was published, so new fields are
  recorded automatically. Gas also arriving over MQTT is recognised by its
  timestamp and not stored twice.
* Readings older than `storage.retention_days` (default 90; 0 = forever) are
  deleted hourly. Change it in **History → Local storage**.
* Gas at the default 20 s interval is about 1.5 MB/day (≈ 135 MB for 90 days).

## Calibration (three levels, zero and span)
Every calibration value has three levels. The reader uses the highest one that
has a value; a higher level never deletes the ones below it.

| Level | File | Who changes it |
|-------|------|----------------|
| **User** | `calibration/user.yaml` | the **Client** login (the portal login in `config.yaml`) |
| **Manufacturer** | `calibration/manufacturer.yaml` | the **Manufacturer** login (`python3 auth.py set-manufacturer <name>`) |
| **Factory** | `calibration/factory.yaml` | nobody in the portal: datasheet values, read-only, always complete |

Per gas: zero (WE₀/AE₀), signed sensitivity, and straight-line corrections
`WE = m₁·OP1 + c₁`, `AE = m₂·OP2 + c₂`, `final = m₃·reading + c₃` (O₃: m₄, c₄).
With every m = 1 and c = 0 the result is the plain Alphasense formula.

**Calibration tab → + New calibration** runs a zero (zero air) or span
calibration for one or several gases in five steps. Span gases come from one
mixed cylinder or separate cylinders (concentration per gas in ppm; certificate
no. required for every cylinder); O₃ comes from an ozone calibrator (the wizard
warns), and when O₃ and NO₂ are spanned together the O₃ sensor's target is
O₃ + NO₂ because the OX-B431 reacts to both. A manufacturer calibration is
refused for a gas whose client value would stay on top. Steps: set up → before (reader samples every 5 s; wait for *Stable*)
→ apply (new zero, or new gain = gas value ÷ reading) → after (records again to
check) → save. Each run is kept as a calibration record with the cylinder
details, pre/post values, pass/fail, its readings (CSV) and a printable
certificate. The Client never receives gains/offsets from the API.

Timings and limits can be tuned in `config.yaml → calibration:`.

## v1 scope
| Tab | Does |
|-----|------|
| **Overview** | Health: service state, uptime, CPU temp, storage, I²C devices, last-report age |
| **Live & Diagnostics** | Real-time readings incl. raw electrode voltages; I²C bus scan |
| **History** | Charts + table of saved readings (gas / particulate / weather), time-range picker, CSV download, retention setting |
| **Calibration** | Zero/span calibration wizard and records, values in use per level (with resets), electrode-voltage charts, alert thresholds |
| **Connectivity** | MQTT broker settings + **Test connection** |
| **System** | Start/stop/restart reader, sampling settings, live log viewer |

## Files
| File | Purpose |
|------|---------|
| `config.yaml` | Shared device settings (portal + reader) |
| `config.py` | Atomic load/save + deep-merge |
| `app.py` | FastAPI REST + WebSocket + serves the UI |
| `../gas-monitor/4_gas_reader.py` | The gas reader that runs as `gas-monitor.service` |
| `calibration.py` | Calibration levels + the y = mx + c calculation (shared by reader and portal) |
| `calibration_api.py` | Calibration tab API: wizard, records, CSV, certificate |
| `auth.py` | Client + Manufacturer logins |
| `calibration/` | Level files, manufacturer login hash, running-session file (on the Pi only, git-ignored) |
| `reader.py` | Older config-driven reader (not used by `gas-monitor.service`) |
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

### Gas reader and calibration (once per logger)
`gas-monitor.service` runs `gas-monitor/4_gas_reader.py`, which loads the
portal's `config.yaml` (`/home/adminpi4/logger-portal/config.yaml`, override with
`BAYU_CONFIG`) and imports `calibration.py` / `storage.py` from the same folder.

```bash
cd /home/adminpi4/logger-portal
python3 calibration.py init                      # creates calibration/, moves zeros out of config.yaml
python3 auth.py set-manufacturer <username>      # asks for the manufacturer password
sudo chown root: calibration/factory.yaml        # keep factory values read-only
sudo systemctl restart gas-monitor.service bayu-portal.service
```

Run `gas-monitor.service` as the **same user as the portal** (`User=` in
`bayu-portal.service`): both write to `data/bayu.db` and `calibration/`.
If files were created by `root`: `sudo chown -R <portal-user>: data calibration`
(then re-apply the factory.yaml step).

## Security notes (before production)
- Set a real password under `portal:` in `config.yaml` (empty = auth off).
- Put nginx in front with a **self-signed HTTPS** cert; bind portal to `127.0.0.1`
  and let nginx serve `0.0.0.0:443`.
- Keep it **LAN-only** (firewall the port off the internet).
- Keep MQTT and portal passwords in `config.yaml` on the Pi only; never commit them.

## Not in v1 (good next steps)
WiFi/network config UI · store-and-forward (re-send saved readings to the cloud after an outage) · OTA update ·
config backup/restore · manual entry of OP1/OP2/sensitivity per level · calibration due reminders · first-boot wizard.
