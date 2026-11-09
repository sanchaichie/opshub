#!/usr/bin/env bash
# Connects the shared demo org to a Slack channel, so demo visitors see real
# Slack messages. The demo org has no owner account (visitors are throwaway,
# ADR 0007), so it can't use the normal OAuth flow; the project owner runs
# this once instead.
#
#   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... bash scripts/connect-demo-slack.sh
#
# Get the URL from your Slack app → Incoming Webhooks → Add New Webhook.
# The URL is passed to psql as a variable on stdin, so it never appears in the
# process list. Export it rather than typing it inline, to keep it out of
# shell history.
#
# LOCAL ONLY. For production, run the SQL at the bottom of this file in the
# Supabase SQL editor (this repo never writes to the production database
# from a laptop; see CLAUDE.md).
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/assert-local-db.sh

: "${SLACK_WEBHOOK_URL:?Set SLACK_WEBHOOK_URL to a Slack incoming-webhook URL}"
if [[ ! "$SLACK_WEBHOOK_URL" =~ ^https://hooks\.slack\.com/services/ ]]; then
  echo "✋ SLACK_WEBHOOK_URL must start with https://hooks.slack.com/services/" >&2
  exit 1
fi
CHANNEL="${SLACK_CHANNEL:-#opshub-demo}"

docker exec -i supabase_db_opshub psql -U postgres -v ON_ERROR_STOP=1 -q \
  -v webhook_url="$SLACK_WEBHOOK_URL" -v channel="$CHANNEL" <<'SQL'
with connection as (
  insert into public.connections (org_id, provider, status, account_label, metadata)
  values ('de300000-0000-4000-8000-000000000001', 'slack', 'connected',
          :'channel' || ' (demo)', jsonb_build_object('channel', :'channel'))
  on conflict (org_id, provider) do update
    set status = 'connected', account_label = excluded.account_label, metadata = excluded.metadata
  returning id
)
select public.set_connection_secret((select id from connection), jsonb_build_object('webhook_url', :'webhook_url')::text);
SQL

echo "✓ Demo org connected to Slack (${CHANNEL}). Demo messages are capped at 30/hour."

# ── Production ────────────────────────────────────────────────────────────────
# Run in the Supabase dashboard → SQL editor, replacing the two values:
#
#   with connection as (
#     insert into public.connections (org_id, provider, status, account_label, metadata)
#     values ('de300000-0000-4000-8000-000000000001', 'slack', 'connected',
#             '#opshub-demo (demo)', '{"channel": "#opshub-demo"}')
#     on conflict (org_id, provider) do update
#       set status = 'connected', account_label = excluded.account_label, metadata = excluded.metadata
#     returning id
#   )
#   select public.set_connection_secret((select id from connection),
#     '{"webhook_url": "https://hooks.slack.com/services/…"}');
