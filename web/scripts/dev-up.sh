#!/usr/bin/env bash
# Start local Postgres + Next dev server (cloud sessions stop background services when idle).
set -u
service postgresql start >/dev/null 2>&1 || true
cd "$(dirname "$0")/.."
if ! curl -s -o /dev/null localhost:3000/; then
  nohup npm run dev > "${TMPDIR:-/tmp}/ggm-dev.log" 2>&1 &
  for _ in $(seq 1 40); do curl -s -o /dev/null localhost:3000/ && break; sleep 2; done
fi
echo "db: $(pg_lsclusters | awk 'NR==2{print $4}')  web: $(curl -s -o /dev/null -w '%{http_code}' localhost:3000/)"
