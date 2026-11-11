#!/usr/bin/env bash
# Connects the shared demo org to the owner's Google account (Gmail + Calendar),
# like scripts/connect-demo-slack.sh does for Slack. The demo org has no owner
# account (ADR 0007), so it can't use the normal OAuth flow.
#
#   GOOGLE_REFRESH_TOKEN=… GOOGLE_EMAIL=you@example.com bash scripts/connect-demo-google.sh
#
# Get a refresh token for OpsHub's Google OAuth client (scopes: openid email
# gmail.send calendar.events), e.g. by connecting Google to your own org in a
# local OpsHub and copying it from there, or with Google's OAuth Playground
# configured to use OpsHub's client. Only the refresh token is stored; the first
# job refreshes an access token from it. Demo email and invites only ever go to
# NUXT_DEMO_EMAIL_ALLOWLIST.
#
# LOCAL ONLY. For production, run the equivalent SQL in the Supabase SQL editor.
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/assert-local-db.sh

: "${GOOGLE_REFRESH_TOKEN:?Set GOOGLE_REFRESH_TOKEN}"
: "${GOOGLE_EMAIL:?Set GOOGLE_EMAIL (the connected account, for the Connections page)}"

docker exec -i supabase_db_opshub psql -U postgres -v ON_ERROR_STOP=1 -q \
  -v refresh_token="$GOOGLE_REFRESH_TOKEN" -v email="$GOOGLE_EMAIL" <<'SQL'
with connection as (
  insert into public.connections (org_id, provider, status, account_label, metadata, token_expires_at)
  -- Already "expired": the first job refreshes an access token.
  values ('de300000-0000-4000-8000-000000000001', 'google', 'connected', :'email', jsonb_build_object('email', :'email'), now())
  on conflict (org_id, provider) do update
    set status = 'connected', account_label = excluded.account_label, metadata = excluded.metadata, token_expires_at = now()
  returning id
)
select public.set_connection_secret((select id from connection), jsonb_build_object('refresh_token', :'refresh_token')::text);
SQL

echo "✓ Demo org connected to Google (${GOOGLE_EMAIL})."
