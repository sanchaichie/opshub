begin;
select plan(7);

-- Browser roles must not be able to write heartbeats or read their status.
select ok(
  not has_function_privilege('anon', 'public.heartbeat(text)', 'execute'),
  'anon cannot call heartbeat()'
);
select ok(
  not has_function_privilege('authenticated', 'public.heartbeat(text)', 'execute'),
  'authenticated cannot call heartbeat()'
);
select ok(
  not has_function_privilege('authenticated', 'public.heartbeat_status()', 'execute'),
  'authenticated cannot call heartbeat_status()'
);
select ok(
  has_function_privilege('service_role', 'public.heartbeat(text)', 'execute'),
  'service_role can call heartbeat()'
);

-- The table lives outside the API-exposed schema.
select hasnt_table('public', 'system_heartbeats', 'heartbeats are not in the public schema');

-- Beats accumulate per source.
set local role service_role;
select public.heartbeat('manual');
select results_eq(
  $$ select beats from public.heartbeat('manual') where source = 'manual' $$,
  $$ values (2::bigint) $$,
  'a second heartbeat increments the counter'
);

select throws_ok(
  $$ select public.heartbeat('someone-else') $$,
  '23514',
  null,
  'unknown sources are rejected'
);

select * from finish();
rollback;
