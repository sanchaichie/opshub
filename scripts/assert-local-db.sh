#!/usr/bin/env bash
# Succeeds only if this project's LOCAL Supabase stack is running and every
# database URL in sight points at this machine. Everything that can destroy
# data (db:reset, pgTAP runs) calls this first.
#
#   bash scripts/assert-local-db.sh [--quiet]
set -euo pipefail

quiet=false; [[ "${1:-}" == "--quiet" ]] && quiet=true
fail() { $quiet || echo "✋ assert-local-db: $*" >&2; exit 1; }

cd "$(dirname "$0")/.."

expected_port=$(awk '/^\[db\]/{f=1;next} /^\[/{f=0} f && /^port *=/{print $3; exit}' supabase/config.toml)
[[ -n "$expected_port" ]] || fail "could not read [db] port from supabase/config.toml"

is_local_url() { [[ "$1" =~ ^postgres(ql)?://[^@]*@(127\.0\.0\.1|localhost|\[::1\]):[0-9]+/ ]]; }

# A remote URL lingering in the shell is a sign something is misconfigured.
for var in DATABASE_URL SUPABASE_DB_URL PGHOST; do
  val="${!var:-}"
  [[ -z "$val" ]] && continue
  if [[ "$var" == PGHOST ]]; then
    [[ "$val" =~ ^(127\.0\.0\.1|localhost|::1)$ ]] || fail "\$PGHOST points at a remote host ($val). Unset it first."
  else
    is_local_url "$val" || fail "\$$var points at a remote database. Unset it first."
  fi
done

status_json=$(supabase status -o json 2>/dev/null) || fail "local Supabase is not running. Start it with: pnpm db:start"
db_url=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s.slice(s.indexOf("{"))).DB_URL||"")}catch{}})' <<<"$status_json")

[[ -n "$db_url" ]] || fail "could not read DB_URL from 'supabase status'."
is_local_url "$db_url" || fail "DB_URL is not local. Refusing."
[[ "$db_url" == *":${expected_port}/"* ]] || fail "DB_URL port does not match supabase/config.toml (${expected_port})."

$quiet || echo "✓ local Supabase on port ${expected_port}"
