#!/usr/bin/env bash
# The ONLY supported way to reset a database in this repo: wipes the LOCAL
# stack, re-applies every migration and seed.sql, runs pgTAP, regenerates types.
#
# There is deliberately no script for resetting a remote database. Production
# demo data is reset by `select private.reset_demo_data();` (pg_cron, nightly).
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/assert-local-db.sh

echo "→ Resetting LOCAL database (migrations + seed)…"
supabase db reset --local

if compgen -G "supabase/tests/*.sql" > /dev/null; then
  echo "→ Running pgTAP tests…"
  supabase test db
fi

echo "→ Regenerating shared/types/database.types.ts…"
supabase gen types typescript --local > shared/types/database.types.ts

echo "✓ Local database reset."
