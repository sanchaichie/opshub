#!/usr/bin/env bash
# Points the LOCAL database's pg_cron worker job at your dev server, by storing
# the worker URL and CRON_SECRET in the local Vault.
#
#   CRON_SECRET=<same value as in .env> bash scripts/configure-worker.sh
#
# The secret is passed to psql as a variable on stdin, so it never appears in
# the process list or shell history (as long as you export it rather than
# typing it inline). For production, run the same two statements in the
# Supabase SQL editor with your deployed URL; see docs/plan/00-architecture.md.
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/assert-local-db.sh

: "${CRON_SECRET:?Set CRON_SECRET to the value in your .env}"
# pg_net runs inside Docker, so "localhost" would mean the container itself.
WORKER_URL="${WORKER_URL:-http://host.docker.internal:3000/api/jobs/run}"

docker exec -i supabase_db_opshub psql -U postgres -v ON_ERROR_STOP=1 -q \
  -v worker_url="$WORKER_URL" -v cron_secret="$CRON_SECRET" <<'SQL'
delete from vault.secrets where name in ('opshub_worker_url', 'opshub_cron_secret');
select vault.create_secret(:'worker_url', 'opshub_worker_url', 'URL pg_cron POSTs to');
select vault.create_secret(:'cron_secret', 'opshub_cron_secret', 'Bearer token for /api/jobs/run');
SQL

echo "✓ Local worker job now calls ${WORKER_URL} every minute."
