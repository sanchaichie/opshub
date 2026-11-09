-- Scheduled jobs.
--
-- process-events: every minute, POST to the app's /api/jobs/run so failed and
--   pending events get retried even if no webhook arrives to trigger them.
-- purge-usage-counters: daily, delete rate-limit windows older than 2 days.
--
-- The worker URL and CRON_SECRET live in Vault, not in this file, so the same
-- migration works locally and in production. Until both secrets exist the
-- job is a no-op (see private.invoke_worker), which keeps fresh local stacks
-- and CI quiet. Configure with scripts/configure-worker.sh.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.invoke_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  secret     text;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets where name = 'opshub_worker_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'opshub_cron_secret';

  if worker_url is null or secret is null then
    return;  -- not configured in this environment
  end if;

  -- Accepted risk: pg_net keeps the queued request (including this header)
  -- in net.http_request_queue until it is sent, usually well under a second.
  -- Supabase grants pg_net's tables to PUBLIC as supabase_admin, which this
  -- migration can't revoke. Browser roles still can't reach them: the Data
  -- API only exposes `public` and `graphql_public` (supabase/config.toml), and
  -- cron.test.sql checks nothing in `public` leads to `net`. A leaked secret
  -- only lets someone run the worker early; it can't read or change data.
  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    -- Matches the function's maxDuration on Vercel (nuxt.config.ts).
    timeout_milliseconds := 60000
  );
end;
$$;

create function private.purge_usage_counters()
returns void
language sql
security definer
set search_path = ''
as $$
  -- Longest window in use is one day; keep a day of slack for debugging.
  delete from private.usage_counters where window_start < now() - interval '2 days';
$$;

-- The purge filters on window_start, which the (key, window_start) PK can't serve.
create index usage_counters_window_start_idx on private.usage_counters (window_start);

revoke all on function private.invoke_worker() from public, anon, authenticated;
revoke all on function private.purge_usage_counters() from public, anon, authenticated;

select cron.schedule('process-events', '* * * * *', 'select private.invoke_worker()');
select cron.schedule('purge-usage-counters', '15 3 * * *', 'select private.purge_usage_counters()');
