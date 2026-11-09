begin;
select plan(8);

select results_eq(
  $$ select jobname::text collate "default", schedule::text collate "default" from cron.job order by jobname $$,
  $$ values ('detect-stuck-orders'::text, '*/5 * * * *'::text), ('process-events', '* * * * *'), ('purge-usage-counters', '15 3 * * *'), ('reset-demo', '0 3 * * *') $$,
  'the scheduled jobs exist with the expected schedules'
);

-- Unconfigured (no Vault secrets): the worker call is a silent no-op.
select lives_ok($$ select private.invoke_worker() $$, 'invoke_worker is a no-op until configured');
select is((select count(*)::int from net.http_request_queue), 0, 'and queues no HTTP request');

-- Configured: it queues exactly one authenticated POST to the worker.
select vault.create_secret('http://example.test/api/jobs/run', 'opshub_worker_url');
select vault.create_secret('test-secret', 'opshub_cron_secret');
select private.invoke_worker();
select is(
  (select count(*)::int from net.http_request_queue
   where url = 'http://example.test/api/jobs/run' and method = 'POST'
     and headers ->> 'Authorization' = 'Bearer test-secret'),
  1, 'once configured it queues one POST with the bearer token isCronRequest expects'
);

-- The queued request holds the bearer secret until pg_net sends it. pg_net's
-- own tables are granted to PUBLIC by supabase_admin and can't be revoked by
-- us (see the migration), so the guarantee we CAN enforce is that nothing in
-- the API-exposed `public` schema leads to them.
select is(
  (select count(*)::int
   from pg_depend d
   join pg_rewrite rw on rw.oid = d.objid
   join pg_class v on v.oid = rw.ev_class
   join pg_class t on t.oid = d.refobjid
   where v.relnamespace = 'public'::regnamespace
     and t.relnamespace = 'net'::regnamespace),
  0, 'no view in public exposes pg_net tables'
);
select ok(
  not has_function_privilege('authenticated', 'private.invoke_worker()', 'execute')
  and not has_function_privilege('authenticated', 'private.purge_usage_counters()', 'execute'),
  'browser roles cannot trigger the jobs directly'
);
select ok(
  not exists (select 1 from cron.job where command like '%Bearer%' or command like '%secret%'),
  'no secret is stored in the cron job definitions'
);

-- Purge keeps recent windows and drops old ones.
insert into private.usage_counters (key, window_start, count) values
  ('old', now() - interval '3 days', 1),
  ('new', now(), 1);
select private.purge_usage_counters();
select results_eq(
  $$ select key from private.usage_counters where key in ('old', 'new') $$,
  $$ values ('new') $$,
  'purge removes windows older than 2 days'
);

select * from finish();
rollback;
