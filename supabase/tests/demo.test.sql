begin;
select plan(28);

-- The nightly reset is the only reset that ever runs in production. These
-- tests build a real (non-demo) org with a row in EVERY org-scoped table and
-- prove all of it survives, along with the protections around is_demo.

\set demo '''de300000-0000-4000-8000-000000000001'''

-- ── A real org with data everywhere ─────────────────────────────────────────
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000aa', 'real@customer.test', '{}', '{}');

create temp table real_org as
select org_id as id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000aa';

insert into public.customers (org_id, email) select id, 'buyer@real.test' from real_org;
insert into public.orders (org_id, source, amount_cents, currency, customer_id)
select r.id, 'checkout', 1000, 'usd', c.id from real_org r join public.customers c on c.org_id = r.id;
insert into public.events (org_id, direction, provider, type, external_id, order_id)
select r.id, 'inbound', 'stripe', 'payment_intent.succeeded', 'evt_real_1', o.id
from real_org r join public.orders o on o.org_id = r.id;
insert into public.event_attempts (event_id, org_id, attempt_no)
select e.id, e.org_id, 1 from public.events e where e.external_id = 'evt_real_1';
insert into public.order_status_history (org_id, order_id, to_status, event_id)
select o.org_id, o.id, 'paid', e.id from public.orders o join public.events e on e.order_id = o.id
where o.org_id = (select id from real_org);
insert into public.ai_outputs (org_id, order_id, kind, model, content)
select org_id, id, 'summary', 'test-model', 'ok' from public.orders where org_id = (select id from real_org);
insert into public.connections (org_id, provider) select id, 'slack' from real_org;

-- The demo org: a connection to keep, visitor activity to wipe, and a job a
-- worker is processing right now.
insert into public.connections (org_id, provider) values (:demo, 'slack');
insert into public.events (org_id, direction, provider, type, idempotency_key) values
  (:demo, 'outbound', 'stripe', 'simulate_payment', 'visitor-1');
insert into public.events (org_id, direction, provider, type, idempotency_key, status, locked_at) values
  (:demo, 'outbound', 'stripe', 'simulate_payment', 'in-flight', 'processing', now()),
  (:demo, 'outbound', 'stripe', 'simulate_payment', 'abandoned', 'processing', now() - interval '10 minutes');

-- Demo visitors: one from two days ago (with a leftover personal workspace),
-- one from an hour ago. created_at is backdated after the sign-up trigger ran.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'old-visitor@demo.example.com', '{"demo":true}', '{}', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000d2', 'new-visitor@demo.example.com', '{"demo":true}', '{}', now() - interval '1 hour');
insert into public.memberships (org_id, user_id, role) values
  (:demo, '00000000-0000-0000-0000-0000000000d1', 'member'),
  (:demo, '00000000-0000-0000-0000-0000000000d2', 'member');
insert into public.organizations (id, name, slug) values ('00000000-0000-4000-8000-0000000000f1', 'Leftover', 'leftover-ws');
insert into public.memberships (org_id, user_id, role) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'owner');

-- ── Reset ───────────────────────────────────────────────────────────────────
select lives_ok($$ select private.reset_demo_data() $$, 'reset_demo_data runs');

select is((select count(*)::int from public.customers where org_id = (select id from real_org)), 1, 'real org keeps customers');
select is((select count(*)::int from public.orders where org_id = (select id from real_org)), 1, 'real org keeps orders');
select is((select count(*)::int from public.events where org_id = (select id from real_org)), 1, 'real org keeps events');
select is((select count(*)::int from public.event_attempts where org_id = (select id from real_org)), 1, 'real org keeps event attempts');
select is((select count(*)::int from public.order_status_history where org_id = (select id from real_org)), 1, 'real org keeps status history');
select is((select count(*)::int from public.ai_outputs where org_id = (select id from real_org)), 1, 'real org keeps AI outputs');
select is((select count(*)::int from public.connections where org_id = (select id from real_org)), 1, 'real org keeps connections');
select is((select count(*)::int from public.memberships where org_id = (select id from real_org)), 1, 'real org keeps memberships');
select ok(
  (select order_id is not null from public.events where external_id = 'evt_real_1'),
  'real org''s links are not nulled'
);

select is((select count(*)::int from public.events where idempotency_key = 'visitor-1'), 0, 'visitor activity in the demo org is wiped');
select is((select count(*)::int from public.events where idempotency_key = 'in-flight'), 1, 'a job a worker is processing is left alone');
select is((select count(*)::int from public.events where idempotency_key = 'abandoned'), 0, 'a job abandoned for 10+ minutes is wiped');

select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000d1'), 0, 'demo visitors older than a day are removed');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000d2'), 1, 'recent demo visitors are kept');
select is((select count(*)::int from public.organizations where id = '00000000-0000-4000-8000-0000000000f1'), 0, 'a workspace only demo visitors belong to is removed');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000aa'), 1, 'real users are never removed');
select is((select count(*)::int from public.orders where org_id = :demo), 5, 'the demo org is re-seeded with the 5-order baseline');
select is((select count(*)::int from public.connections where org_id = :demo), 1, 'the demo org stays connected to its sandbox accounts');

select is(
  (select count(*)::int from public.orders where org_id = :demo and shipping_address is null),
  0, 'every seeded demo order has a shipping address'
);
select throws_ok(
  $$ update public.orders set shipping_address = '{"name":"No street"}' where org_id = (select id from real_org) $$,
  '23514', null, 'an address missing required fields is rejected'
);
select throws_ok(
  $$ update public.orders set shipping_address = '{"name":"A","street1":"","city":"X","country":"US"}' where org_id = (select id from real_org) $$,
  '23514', null, 'an empty street is rejected'
);
select throws_ok(
  $$ update public.orders set shipping_address = '{"name":"A","street1":"1 St","city":"X","country":"usa"}' where org_id = (select id from real_org) $$,
  '23514', null, 'a country that is not an ISO 3166 alpha-2 code is rejected'
);
select lives_ok(
  $$ update public.orders set shipping_address = '{"name":"Li Wei","street1":"1 Queen''s Rd","city":"Central","country":"HK"}' where org_id = (select id from real_org) $$,
  'an address without a postal code is accepted'
);
select throws_ok(
  $$ update public.orders set easypost_shipment_id = 'shp_same' where org_id = 'de300000-0000-4000-8000-000000000001' $$,
  '23505', null, 'one EasyPost shipment can never belong to two orders'
);

-- ── Guards ──────────────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.organizations set is_demo = true where id = (select id from real_org) $$,
  '42501', null, 'a real org can never become a demo org (and be wiped)'
);
select throws_ok(
  $$ select private.seed_demo_data((select id from real_org)) $$,
  'P0001', null, 'seeding refuses a non-demo org'
);
select ok(
  not has_function_privilege('authenticated', 'private.reset_demo_data()', 'execute')
  and not has_function_privilege('anon', 'private.reset_demo_data()', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_data(uuid)', 'execute'),
  'browser roles cannot trigger a reset'
);

select * from finish();
rollback;
