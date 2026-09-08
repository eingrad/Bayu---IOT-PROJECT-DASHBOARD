#!/usr/bin/env bash
# Pre-deployment collision check.
#
# Run on the server BEFORE `docker compose up`. Verifies that nothing this
# stack claims — container names, the compose project, its network and volume,
# and any optional host port — is already taken by the other projects on this
# host (aqms-*, aquamind-*).
#
#   ./preflight.sh
#
# Exit 0 = safe to deploy. Non-zero = a collision or missing secret, listed.

cd "$(dirname "$0")" || exit 1

red() { printf '\033[31m%s\033[0m\n' "$*"; }
grn() { printf '\033[32m%s\033[0m\n' "$*"; }
ylw() { printf '\033[33m%s\033[0m\n' "$*"; }

fail=0
note=0

if [ ! -f .env ]; then
  red "FAIL  .env not found — copy it first:  cp .env.example .env"
  exit 1
fi

# Every docker lookup below returns empty when the daemon is unreachable, which
# would be reported as "free" — a false all-clear. Refuse to run in that state.
if ! docker info >/dev/null 2>&1; then
  red "FAIL  cannot reach the Docker daemon — collision checks would be meaningless."
  echo "        Start it:       sudo systemctl start docker"
  echo "        Or fix access:  sudo usermod -aG docker \$USER   (then re-login)"
  exit 1
fi

echo "Checking for collisions with the other projects on this host..."
echo

# ---- 1. Container names ---------------------------------------------------
# Names are global to the daemon and fixed in docker-compose.yml, so a
# duplicate is a hard failure at startup. Stopped containers hold names too.
existing=$(docker ps -a --format '{{.Names}}')
for name in bayu-cloudflared bayu-db bayu-server bayu-public-api bayu-frontend; do
  if printf '%s\n' "$existing" | grep -qx "$name"; then
    owner=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null)
    if [ "$owner" = "bayu-sense" ]; then
      ylw "note  container $name exists, owned by this project (previous deploy)"
      note=1
    else
      red "FAIL  container name $name is taken by another project: ${owner:-unknown}"
      fail=1
    fi
  else
    grn "ok    container name $name free"
  fi
done

# ---- 2. Compose project ---------------------------------------------------
# All resources are namespaced by project name, so the only way to collide with
# aqms/aquamind is if one of them is also called bayu-sense.
projects=$(docker compose ls -a --format json 2>/dev/null)
if printf '%s' "$projects" | grep -q '"Name":"bayu-sense"'; then
  if printf '%s' "$projects" | grep -q "$(pwd)"; then
    ylw "note  compose project bayu-sense already exists, from this directory"
    note=1
  else
    red "FAIL  compose project name bayu-sense belongs to another directory."
    echo "        Inspect it with:  docker compose ls -a"
    fail=1
  fi
else
  grn "ok    compose project name bayu-sense free"
fi

# ---- 3. Network and volume ------------------------------------------------
if docker network ls --format '{{.Name}}' | grep -qx "bayu-sense_default"; then
  ylw "note  network bayu-sense_default exists (previous deploy of this project)"
  note=1
else
  grn "ok    network bayu-sense_default free"
fi

if docker volume ls --format '{{.Name}}' | grep -qx "bayu-sense_bayu-db-data"; then
  ylw "note  volume bayu-sense_bayu-db-data exists — it holds your database."
  ylw "      'up' reuses it; only 'down -v' destroys it."
  note=1
else
  grn "ok    volume bayu-sense_bayu-db-data free (a new database will be created)"
fi

# ---- 4. Host ports --------------------------------------------------------
# Normally none: this stack reaches Cloudflare through its own cloudflared
# container, so it publishes nothing. Only check if DB_HOST_PORT was opted in.
db_port=$(grep -E '^DB_HOST_PORT=' .env | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')
if [ -z "$db_port" ]; then
  grn "ok    no host ports published — cannot collide with aqms or aquamind"
else
  if command -v ss >/dev/null 2>&1; then
    holder=$(ss -tlnp 2>/dev/null | awk -v p=":$db_port\$" '$4 ~ p {print; exit}')
  else
    holder=$(netstat -tlnp 2>/dev/null | awk -v p=":$db_port\$" '$4 ~ p {print; exit}')
  fi
  if [ -n "$holder" ]; then
    red "FAIL  DB_HOST_PORT $db_port is already in use:"
    echo "        $holder"
    fail=1
  else
    grn "ok    DB_HOST_PORT $db_port free"
  fi
fi

# ---- 5. Secrets -----------------------------------------------------------
if grep -q 'CHANGE_ME' .env; then
  red "FAIL  .env still contains CHANGE_ME placeholders:"
  grep -n 'CHANGE_ME' .env | sed 's/^/        /'
  fail=1
else
  grn "ok    no CHANGE_ME placeholders left in .env"
fi

# The tunnel token is what makes the site reachable; an empty one starts a
# cloudflared that silently connects to nothing.
token=$(grep -E '^CLOUDFLARE_TUNNEL_TOKEN=' .env | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')
if [ -z "$token" ]; then
  red "FAIL  CLOUDFLARE_TUNNEL_TOKEN is empty — the dashboard would be unreachable."
  fail=1
else
  grn "ok    CLOUDFLARE_TUNNEL_TOKEN is set"
fi

echo
if [ "$fail" -ne 0 ]; then
  red "Problems found — fix the FAIL lines above before deploying."
  exit 1
fi
if [ "$note" -ne 0 ]; then
  ylw "Notes above are expected on a redeploy; they are not collisions."
fi
grn "No collisions. Safe to run: docker compose up -d --build"
