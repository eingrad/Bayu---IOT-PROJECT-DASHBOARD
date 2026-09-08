# Deploying Bayu Sense

This stack runs under Docker Compose on `wqsserver`, alongside the existing
`aqms-*` and `aquamind-*` projects. It follows the same pattern those use: its
own `cloudflared` container, and **no published host ports at all**.

## How it fits together

```
browser ──HTTPS──> Cloudflare edge ──tunnel──> bayu-cloudflared
                                                     │  (compose network)
                                              frontend:80  (nginx)
                                              ├── /            SPA
                                              ├── /api/        -> server:5000
                                              ├── /ws          -> server:5000
                                              └── /public-api/ -> public-api:5050
                                                     │
                                             server, public-api
                                                     │
                                                 db (postgres)

  server ──outbound TLS :8883──> HiveMQ Cloud (MQTT telemetry)
```

| Service       | Role                                       | Published |
| ------------- | ------------------------------------------ | --------- |
| `cloudflared` | This project's tunnel to Cloudflare         | none      |
| `frontend`    | SPA + reverse proxy — the tunnel's target   | none      |
| `server`      | Express API, WebSocket bridge, MQTT ingest  | none      |
| `public-api`  | Separate public API with its own auth       | none      |
| `db`          | Postgres 16, data in a named volume         | none      |

Nothing binds a host port. Everything is reached over the compose network,
either by the tunnel or between containers. TLS terminates at Cloudflare, so
this stack speaks plain HTTP internally and needs no certificate config.

## Why this cannot collide with aqms or aquamind

| Resource        | This stack                | Already on the host              |
| --------------- | ------------------------- | -------------------------------- |
| Host ports      | **none**                  | 8088 (aqms-web-test), 5432 (aqms-db) |
| Container names | `bayu-*`                  | `aqms-*`, `aquamind-*`           |
| Compose project | `bayu-sense`              | `aqms*`, `aquamind-prod`         |
| Network         | `bayu-sense_default`      | each project has its own         |
| Volume          | `bayu-sense_bayu-db-data` | namespaced per project           |
| MQTT            | HiveMQ Cloud (outbound)   | local mosquitto, internal only   |

Publishing no ports removes the only real collision risk. `preflight.sh`
verifies the rest before you start anything.

## 1. Get the code

```bash
git clone <your-repo-url> bayu-sense
cd bayu-sense
```

## 2. Create the tunnel

In **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name it
(e.g. `bayu-sense`) and copy the token it gives you. Do not run the install
command it suggests — the tunnel runs as part of this stack.

Then on that tunnel add a **Public Hostname**:

| Field   | Value                    |
| ------- | ------------------------ |
| Domain  | `dashboard.example.com`  |
| Service | `HTTP` → `frontend:80`   |

`frontend` is the compose service name, resolvable because `bayu-cloudflared`
sits on the same network. `bayu-frontend:80` works too. This is the step that
most often goes wrong — `localhost:80` would point at the cloudflared container
itself and fail.

## 3. Configure secrets

```bash
cp .env.example .env
```

Set every `CHANGE_ME`, including `CLOUDFLARE_TUNNEL_TOKEN` from step 2.
Generate the two JWT secrets with:

```bash
openssl rand -base64 32
```

`.env` is gitignored and must stay that way — it is the only place credentials
live.

## 4. Run the collision check

```bash
./preflight.sh
```

Checks container names, the compose project/network/volume, any opted-in host
port, and that no `CHANGE_ME` or empty tunnel token remains. It exits non-zero
and explains the fix. Do not continue until it passes.

## 5. Start the stack

```bash
docker compose up -d --build
docker compose logs -f
```

The first build takes a few minutes (the API image installs Chromium for PDF
reports). Because nothing is published, verify from inside the network:

```bash
# SPA responds
docker compose exec cloudflared wget -qO- -S http://frontend:80 2>&1 | head -5

# API reachable through the frontend proxy (404 from the app is fine, 502 is not)
docker compose exec frontend wget -qO- -S http://localhost/api/ 2>&1 | head -5
```

A *502* means the frontend cannot reach the API container — check
`docker compose logs server`.

Confirm MQTT and the tunnel attached:

```bash
docker compose logs server      | grep -E 'MQTT|Subscribed'
docker compose logs cloudflared | grep -iE 'registered|connection|error'
```

Then open `https://dashboard.example.com`.

## 6. Check the WebSocket

Live sensor values depend on it. In the browser console you should see
`WebSocket connected to sensor server`. If not, confirm **WebSockets** is
enabled in Cloudflare under *Network* (on by default) and the hostname is
proxied.

## MQTT / HiveMQ

The server subscribes to HiveMQ Cloud over outbound TLS on 8883 — no inbound
ports, unaffected by the tunnel. It is entirely separate from the `aqms-mqtt`
and `aquamind-prod-mqtt` mosquitto brokers, which only listen internally.

The client connects **without a fixed client ID**, so mqtt.js generates a
random one per connection. This deployment will not kick the Raspberry Pi
logger, or any other subscriber, off the broker.

Watch this during migration: telemetry goes to every subscriber, so if the old
instance on your PC keeps running while the server is live, **both ingest the
same readings into separate databases** and drift apart. Stop the old one after
cutover, or treat its database as throwaway.

## Database access

The database publishes no port. For a shell:

```bash
docker compose exec db psql -U postgres bayu_sense
```

If you need a GUI client, uncomment the `ports` block under `db` in
`docker-compose.yml`, set `DB_HOST_PORT` in `.env` to something free (**not**
5432 — `aqms-db` already publishes it), bind it to `127.0.0.1`, and reach it
over an SSH tunnel:

```bash
ssh -L 5434:127.0.0.1:5434 rootadmin@wqsserver
```

## Day-to-day

```bash
docker compose ps                  # what's running
docker compose logs -f server      # one service's logs
docker compose restart server      # restart after an .env change
docker compose up -d --build       # redeploy after a git pull
docker compose down                # stop, keeping data
```

`.env` changes only take effect on `up`/`restart`, not on their own.

## Backups

All data is in the `bayu-sense_bayu-db-data` volume. Dump it regularly:

```bash
docker compose exec db pg_dump -U postgres bayu_sense > backup-$(date +%F).sql
```

Restore into a fresh stack:

```bash
cat backup-2026-09-08.sql | docker compose exec -T db psql -U postgres bayu_sense
```

`docker compose down -v` deletes that volume and the database with it. The SQL
files under `server/` only re-run on a completely empty volume, so an existing
deployment will not pick up schema changes automatically — apply those with
`psql` yourself.

## Known limits

- **Cloudflare cuts HTTP responses at ~100 seconds** (error 524) on Free and
  Pro plans. Puppeteer PDF report generation can exceed that for large date
  ranges; nginx allows 300s but the edge gives up first. If reports start
  failing with 524, generate them asynchronously rather than in the request.
- The JS bundle is ~5.9 MB (plotly, apexcharts, chart.js and fullcalendar all
  bundled). Cloudflare compresses it in transit, but code-splitting would help
  first load.

## How the frontend finds the API

The React app calls **relative** paths (`/api/...`, `/public-api/...`, `/ws`),
defined in [`src/config/api.ts`](src/config/api.ts). The frontend's nginx
strips the prefix and forwards to the right container, so:

- no hostname is compiled into the JavaScript bundle — the same image runs
  locally and in production;
- there is no CORS to configure, since everything is one origin;
- the WebSocket automatically uses `wss://` on an HTTPS page.

For local development, `vite.config.ts` proxies the same paths to
`localhost:5000` and `localhost:5050`, so `npm run dev` works against backends
started with `docker compose up db server public-api`.
