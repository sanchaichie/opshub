begin;
select plan(11);

select is(public.read_usage('tokens:test', interval '1 day'), 0, 'an unused counter reads 0');
select is(public.add_usage('tokens:test', interval '1 day', 1200), 1200, 'adding returns the new total');
select is(public.add_usage('tokens:test', interval '1 day', 300), 1500, 'usage accumulates within the window');
select is(public.read_usage('tokens:test', interval '1 day'), 1500, 'read_usage sees the running total');
select is(public.read_usage('tokens:test', interval '1 hour'), 0, 'a different window size is a separate bucket');

select throws_ok($$ select public.add_usage('tokens:test', interval '1 day', -5) $$, 'P0001', null, 'negative amounts are rejected');
select throws_ok($$ select public.add_usage('tokens:test', interval '1 day', null) $$, 'P0001', null, 'a null amount is rejected');
select throws_ok($$ select public.add_usage('simulate:demo', interval '1 day', 10) $$, 'P0001', null, 'token keys must start with tokens:');
select throws_ok($$ select public.add_usage('tokens:test', interval '7 days', 10) $$, 'P0001', null, 'windows longer than the purge keeps are rejected');

select ok(
  not has_function_privilege('authenticated', 'public.add_usage(text, interval, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_usage(text, interval)', 'execute')
  and not has_function_privilege('anon', 'public.add_usage(text, interval, integer)', 'execute')
  and not has_function_privilege('anon', 'public.read_usage(text, interval)', 'execute'),
  'browser roles cannot read or change usage'
);
select ok(
  has_function_privilege('service_role', 'public.add_usage(text, interval, integer)', 'execute')
  and has_function_privilege('service_role', 'public.read_usage(text, interval)', 'execute'),
  'the server can'
);

select * from finish();
rollback;
