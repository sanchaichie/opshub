begin;
select plan(30);

-- ── Fixtures: two users → two orgs, one row of everything in each ───────────
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@a.test', '{}', '{}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@b.test', '{}', '{}');

create temp table ids as
select
  (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-00000000000a') as org_a,
  (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-00000000000b') as org_b;
grant select on ids to authenticated;

insert into public.customers (id, org_id, email)
select gen_random_uuid(), o, 'buyer@' || o::text || '.test'
from (select org_a as o from ids union all select org_b from ids) s;

insert into public.orders (org_id, customer_id, status, source, amount_cents, currency, stripe_payment_intent_id)
select c.org_id, c.id, 'paid', 'simulated', 4200, 'usd', 'pi_' || c.org_id::text
from public.customers c
-- Only this test's orgs: fresh databases also contain the seeded demo org.
where c.org_id in (select org_a from ids union all select org_b from ids);

insert into public.events (org_id, direction, provider, type, external_id, order_id)
select o.org_id, 'inbound', 'stripe', 'payment_intent.succeeded', 'evt_' || o.org_id::text, o.id
from public.orders o where o.org_id in (select org_a from ids union all select org_b from ids);

insert into public.event_attempts (event_id, org_id, attempt_no)
select e.id, e.org_id, 1 from public.events e where e.org_id in (select org_a from ids union all select org_b from ids);

insert into public.order_status_history (org_id, order_id, to_status)
select o.org_id, o.id, 'paid' from public.orders o where o.org_id in (select org_a from ids union all select org_b from ids);

insert into public.connections (org_id, provider)
select o, 'slack' from (select org_a as o from ids union all select org_b from ids) s;

insert into public.ai_outputs (org_id, order_id, kind, model, content)
select o.org_id, o.id, 'summary', 'test-model', 'All good.' from public.orders o where o.org_id in (select org_a from ids union all select org_b from ids);

-- ── Cross-org isolation: user A sees exactly its own row in every table ─────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.customers), 1, 'customers: A sees only its org');
select is((select count(*)::int from public.orders), 1, 'orders: A sees only its org');
select is((select count(*)::int from public.events), 1, 'events: A sees only its org');
select is((select count(*)::int from public.event_attempts), 1, 'event_attempts: A sees only its org');
select is((select count(*)::int from public.order_status_history), 1, 'order_status_history: A sees only its org');
select is((select count(*)::int from public.connections), 1, 'connections: A sees only its org');
select is((select count(*)::int from public.ai_outputs), 1, 'ai_outputs: A sees only its org');
select ok(
  (select bool_and(org_id = (select org_a from ids)) from public.orders),
  'the visible order belongs to org A'
);

select throws_ok(
  $$ insert into public.orders (org_id, source, amount_cents, currency) values ((select org_a from ids), 'checkout', 1, 'usd') $$,
  '42501', null, 'browser cannot create orders'
);
select throws_ok(
  $$ update public.events set status = 'succeeded' $$,
  '42501', null, 'browser cannot change events (e.g. fake a success)'
);

reset role;

-- ── Privileges ──────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('authenticated', 'public.claim_events(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.bump_usage(text, interval, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.transition_order(uuid, public.order_status, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_connection_secret(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_connection_secret(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_connection_secret(uuid)', 'execute'),
  'browser roles cannot call any service-only function'
);
select ok(
  has_function_privilege('service_role', 'public.claim_events(integer)', 'execute')
  and has_function_privilege('service_role', 'public.get_connection_secret(uuid)', 'execute'),
  'service_role can call them'
);
select ok(
  not has_table_privilege('authenticated', 'private.connection_secrets', 'select')
  and not has_table_privilege('authenticated', 'private.usage_counters', 'select'),
  'private tables are unreadable from the browser'
);
select ok(
  not has_table_privilege('authenticated', 'public.events', 'insert')
  and not has_table_privilege('anon', 'public.events', 'select'),
  'authenticated is read-only and anon has nothing'
);

-- ── Idempotency constraints ─────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.events (org_id, direction, provider, type, external_id)
     values ((select org_a from ids), 'inbound', 'stripe', 'payment_intent.succeeded', 'evt_' || (select org_a from ids)::text) $$,
  '23505', null, 'the same provider event cannot be stored twice'
);
select throws_ok(
  $$ insert into public.events (org_id, direction, provider, type)
     values ((select org_a from ids), 'outbound', 'slack', 'notify') $$,
  '23514', null, 'outbound events require an idempotency key'
);

-- ── Tenant integrity: rows can't reference another org's rows ──────────────
-- (Composite foreign keys; the nightly demo reset depends on this.)
select throws_ok(
  $$ insert into public.order_status_history (org_id, order_id, to_status)
     values ((select org_a from ids), (select id from public.orders where org_id = (select org_b from ids)), 'paid') $$,
  '23503', null, 'status history cannot point at another org''s order'
);
select throws_ok(
  $$ insert into public.events (org_id, direction, provider, type, idempotency_key, order_id)
     values ((select org_a from ids), 'outbound', 'slack', 'x', 'cross-org', (select id from public.orders where org_id = (select org_b from ids))) $$,
  '23503', null, 'an event cannot link to another org''s order'
);
select throws_ok(
  $$ insert into public.event_attempts (event_id, org_id, attempt_no)
     values ((select id from public.events where org_id = (select org_b from ids) limit 1), (select org_a from ids), 9) $$,
  '23503', null, 'an attempt cannot claim another org''s event'
);
select throws_ok(
  $$ insert into public.events (org_id, direction, provider, type, idempotency_key, order_id)
     values (null, 'outbound', 'slack', 'x', 'orgless-link', (select id from public.orders where org_id = (select org_b from ids))) $$,
  '23514', null, 'an event without an org cannot link to anything'
);

-- ── Worker queue: claim_events ──────────────────────────────────────────────
update public.events set status = 'succeeded';  -- park the fixtures

insert into public.events (org_id, direction, provider, type, idempotency_key, status, next_attempt_at, attempts, locked_at) values
  ((select org_a from ids), 'outbound', 'slack', 'notify', 'due',    'pending',    now() - interval '1 second', 0, null),
  ((select org_a from ids), 'outbound', 'slack', 'notify', 'later',  'pending',    now() + interval '1 hour',   0, null),
  ((select org_a from ids), 'outbound', 'slack', 'notify', 'dead',   'dead',       now(),                       5, null),
  ((select org_a from ids), 'outbound', 'slack', 'notify', 'stale',  'processing', now(),                       1, now() - interval '10 minutes'),
  ((select org_a from ids), 'outbound', 'slack', 'notify', 'active', 'processing', now(),                       1, now()),
  -- Crashed during its final allowed attempt (max_attempts defaults to 5).
  ((select org_a from ids), 'outbound', 'slack', 'notify', 'exhausted', 'processing', now(),                    5, now() - interval '10 minutes');

select results_eq(
  $$ select idempotency_key from public.claim_events(10) order by idempotency_key $$,
  $$ values ('due'), ('stale') $$,
  'claims due + abandoned rows; skips future, dead and actively locked rows'
);
select results_eq(
  $$ select status::text, attempts from public.events where idempotency_key = 'due' $$,
  $$ values ('processing', 1) $$,
  'a claimed row is marked processing and its attempt counted'
);
select results_eq(
  $$ select status::text from public.events where idempotency_key = 'exhausted' $$,
  $$ values ('dead') $$,
  'a row abandoned on its last attempt is dead-lettered, not stuck in processing'
);

-- ── Rate limiting: bump_usage ───────────────────────────────────────────────
select public.bump_usage('test:ip', interval '1 hour', 2);
select public.bump_usage('test:ip', interval '1 hour', 2);
select is(
  (select allowed from public.bump_usage('test:ip', interval '1 hour', 2)),
  false, 'the hit past the limit is refused'
);

-- ── Order transitions ───────────────────────────────────────────────────────
select is(
  (select status from public.transition_order((select id from public.orders where org_id = (select org_a from ids)), 'label_created')),
  'label_created'::public.order_status, 'transition_order updates the status'
);
select results_eq(
  $$ select from_status::text, to_status::text from public.order_status_history
     where order_id = (select id from public.orders where org_id = (select org_a from ids)) and from_status is not null $$,
  $$ values ('paid', 'label_created') $$,
  'and records the transition in the history'
);

select throws_ok(
  $$ select public.transition_order(
       (select id from public.orders where org_id = (select org_a from ids)), 'in_transit',
       (select id from public.events where org_id = (select org_b from ids) limit 1)) $$,
  '23503', null, 'a transition cannot cite another org''s event'
);

-- ── Vault-backed connection secrets ─────────────────────────────────────────
select public.set_connection_secret((select id from public.connections where org_id = (select org_a from ids)), '{"token":"one"}');
select public.set_connection_secret((select id from public.connections where org_id = (select org_a from ids)), '{"token":"two"}');
select is(
  public.get_connection_secret((select id from public.connections where org_id = (select org_a from ids))),
  '{"token":"two"}', 'secrets round-trip through Vault, and rotation replaces the value'
);

-- Only this test's connection: other data may exist in a dev database.
create temp table vault_ref as
select cs.vault_secret_id from private.connection_secrets cs
join public.connections c on c.id = cs.connection_id
where c.org_id = (select org_a from ids);
delete from public.connections where org_id = (select org_a from ids);
select is(
  (select count(*)::int from vault.secrets where id in (select vault_secret_id from vault_ref)),
  0, 'deleting a connection deletes its Vault secret'
);

-- ── Realtime ────────────────────────────────────────────────────────────────
select is(
  (select string_agg(c.relname::text, ',' order by c.relname::text)
   from pg_publication_rel pr
   join pg_publication p on p.oid = pr.prpubid
   join pg_class c on c.oid = pr.prrelid
   join pg_namespace n on n.oid = c.relnamespace
   where p.pubname = 'supabase_realtime' and n.nspname = 'public'),
  'events,orders',
  'only events and orders are published to Realtime'
);

select * from finish();
rollback;
