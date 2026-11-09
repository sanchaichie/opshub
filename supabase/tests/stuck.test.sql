begin;
select plan(10);

\set demo '''de300000-0000-4000-8000-000000000001'''

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000a1', 'a@stuck.test', '{}', '{}');
create temp table org as select org_id as id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a1';

-- One order per scenario, in a real org.
insert into public.orders (org_id, source, amount_cents, currency, status, status_changed_at, stripe_payment_intent_id, easypost_shipment_id)
select (select id from org), 'checkout', 100, 'usd', s.status::public.order_status, now() - s.age, 'pi_stuck_' || s.tag, 'shp_' || s.tag
from (values
  ('label-old',    'label_created',    interval '49 hours'),
  ('label-fresh',  'label_created',    interval '47 hours'),
  ('transit-old',  'in_transit',       interval '6 days'),
  ('ofd-old',      'out_for_delivery', interval '6 days'),
  ('transit-new',  'in_transit',       interval '4 days'),
  ('paid-old',     'paid',             interval '30 days'),
  ('delivered',    'delivered',        interval '30 days')
) as s(tag, status, age);

-- A demo order that is only 31 minutes into transit.
insert into public.orders (org_id, source, amount_cents, currency, status, status_changed_at, stripe_payment_intent_id, easypost_shipment_id)
values (:demo, 'simulated', 100, 'usd', 'in_transit', now() - interval '31 minutes', 'pi_stuck_demo', 'shp_demo');

-- An old order that never got a shipment (like the demo's seeded baseline).
insert into public.orders (org_id, source, amount_cents, currency, status, status_changed_at, stripe_payment_intent_id)
values ((select id from org), 'checkout', 100, 'usd', 'in_transit', now() - interval '30 days', 'pi_stuck_no-shipment');

-- ── Run ─────────────────────────────────────────────────────────────────────
select is(private.mark_stuck_orders(), 4, 'marks exactly the 4 stalled orders (3 real + 1 demo)');

select results_eq(
  $$ select replace(stripe_payment_intent_id, 'pi_stuck_', '') from public.orders
     where stripe_payment_intent_id like 'pi_stuck_%' and status = 'stuck' order by 1 $$,
  $$ values ('demo'), ('label-old'), ('ofd-old'), ('transit-old') $$,
  'only orders past their threshold are stuck'
);
select is(
  (select status::text from public.orders where stripe_payment_intent_id = 'pi_stuck_paid-old'),
  'paid', 'orders that never shipped are not "stuck" (nothing to track)'
);
select is(
  (select count(*)::int from public.order_status_history h join public.orders o on o.id = h.order_id
   where o.stripe_payment_intent_id = 'pi_stuck_label-old' and h.to_status = 'stuck' and h.event_id is not null),
  1, 'the transition is in the timeline, linked to its event'
);
select is(
  (select count(*)::int from public.events where provider = 'opshub' and type = 'order.stuck' and status = 'pending'
     and order_id in (select id from public.orders where stripe_payment_intent_id like 'pi_stuck_%')),
  4, 'each stuck order queues one order.stuck event for the worker'
);
select is(
  (select e.org_id from public.events e join public.orders o on o.id = e.order_id where o.stripe_payment_intent_id = 'pi_stuck_demo' and e.type = 'order.stuck'),
  :demo::uuid, 'the event belongs to the order''s own org'
);

select is(
  (select status::text from public.orders where stripe_payment_intent_id = 'pi_stuck_no-shipment'),
  'in_transit', 'an order without a real shipment is never marked stuck'
);
select is(private.mark_stuck_orders(), 0, 'running again marks nothing (idempotent)');

-- A tracker update un-sticks it; stalling again later is a NEW stall.
select public.transition_order((select id from public.orders where stripe_payment_intent_id = 'pi_stuck_transit-old'), 'out_for_delivery');
update public.orders set status_changed_at = now() - interval '7 days' where stripe_payment_intent_id = 'pi_stuck_transit-old';
select is(private.mark_stuck_orders(), 1, 'a second stall of the same order is detected again');

select ok(
  not has_function_privilege('authenticated', 'private.mark_stuck_orders()', 'execute'),
  'browser roles cannot run detection'
);

select * from finish();
rollback;
