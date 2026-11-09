-- Shipping: where an order goes, and how EasyPost webhooks find it again.

alter table public.orders
  add column shipping_address jsonb,
  add column label_url text,
  -- The EasyPost tracker following this order (trk_…).
  add column easypost_tracker_id text,
  -- Non-empty name/street/city and an ISO country code. `zip` is optional:
  -- some countries have no postal codes.
  add constraint orders_shipping_address_shape check (shipping_address is null or (
    jsonb_typeof(shipping_address) = 'object'
    and coalesce(shipping_address ->> 'name', '') <> ''
    and coalesce(shipping_address ->> 'street1', '') <> ''
    and coalesce(shipping_address ->> 'city', '') <> ''
    and coalesce(shipping_address ->> 'country', '') ~ '^[A-Z]{2}$'
    and (not shipping_address ? 'zip' or jsonb_typeof(shipping_address -> 'zip') = 'string')
  ));

comment on column public.orders.shipping_address is
  '{name, street1, street2?, city, state?, zip?, country}. Demo orders only ever carry generated addresses (catalog.ts, seed_demo_data).';

-- EasyPost tracker webhooks find their order ONLY by these globally unique
-- ids, never by tracking code: EasyPost's test codes are shared by many
-- orders (across orgs), so matching on them could move another org's order.
-- Unique indexes also guarantee one shipment / tracker can't belong to two
-- orders. Partial: most rows have neither until a label is bought.
create unique index orders_easypost_shipment_idx on public.orders (easypost_shipment_id) where easypost_shipment_id is not null;
create unique index orders_easypost_tracker_idx on public.orders (easypost_tracker_id) where easypost_tracker_id is not null;

-- Re-define the demo seed so the baseline orders have addresses and shipping
-- details matching their status. (Replaces the version in the demo migration.)
create or replace function private.seed_demo_data(demo_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sample   record;
  cust_id  uuid;
  ord_id   uuid;
  evt_id   uuid;
begin
  if not exists (select 1 from public.organizations where id = demo_org and is_demo) then
    raise exception 'seed_demo_data: % is not a demo org', demo_org;
  end if;

  for sample in
    select * from (values
      ('Ava Silva',    'ava.silva@example.com',    'OpsHub Mug',         2, 1800, 'delivered'::public.order_status, interval '6 days',     '1 Market St',       'San Francisco', 'CA', '94105', 'EZ4000000004'),
      ('Ben Okafor',   'ben.okafor@example.com',   'Uptime T-shirt',     1, 2900, 'in_transit',                     interval '2 days',     '233 S Wacker Dr',   'Chicago',       'IL', '60606', 'EZ2000000002'),
      ('Chloe Novak',  'chloe.novak@example.com',  'Retry-Proof Hoodie', 1, 5900, 'label_created',                  interval '20 hours',   '1 Brattle Sq',      'Cambridge',     'MA', '02138', 'EZ1000000001'),
      ('Dev Patel',    'dev.patel@example.com',    'Sticker Pack',       3,  600, 'stuck',                          interval '4 days',     '700 Congress Ave',  'Austin',        'TX', '78701', 'EZ7000000007'),
      ('Elena Haddad', 'elena.haddad@example.com', 'Incident Notebook',  1, 1200, 'paid',                           interval '35 minutes', '1000 4th Ave',      'Seattle',       'WA', '98104', null)
    ) as s(name, email, product, qty, unit, final_status, age, street, city, state, zip, tracking)
  loop
    insert into public.customers (org_id, email, name)
    values (demo_org, sample.email, sample.name)
    returning id into cust_id;

    insert into public.orders (org_id, customer_id, status, source, amount_cents, currency, line_items,
                               stripe_payment_intent_id, shipping_address, carrier, tracking_code,
                               created_at, status_changed_at)
    values (demo_org, cust_id, sample.final_status, 'simulated', sample.qty * sample.unit, 'usd',
            jsonb_build_array(jsonb_build_object('name', sample.product, 'quantity', sample.qty, 'unit_amount', sample.unit)),
            'pi_demo_' || replace(gen_random_uuid()::text, '-', ''),
            jsonb_build_object('name', sample.name, 'street1', sample.street, 'city', sample.city,
                               'state', sample.state, 'zip', sample.zip, 'country', 'US'),
            case when sample.tracking is not null then 'USPS' end,
            sample.tracking,
            now() - sample.age, now() - sample.age / 2)
    returning id into ord_id;

    insert into public.events (org_id, direction, provider, type, status, external_id, order_id,
                               request, attempts, created_at, processed_at)
    values (demo_org, 'inbound', 'stripe', 'payment_intent.succeeded', 'succeeded',
            'evt_demo_' || replace(gen_random_uuid()::text, '-', ''), ord_id,
            jsonb_build_object('body', jsonb_build_object('note', 'Seeded demo event')), 1,
            now() - sample.age, now() - sample.age)
    returning id into evt_id;

    insert into public.order_status_history (org_id, order_id, from_status, to_status, event_id, created_at)
    values (demo_org, ord_id, 'pending', 'paid', evt_id, now() - sample.age);

    if sample.final_status <> 'paid' then
      insert into public.order_status_history (org_id, order_id, from_status, to_status, created_at)
      values (demo_org, ord_id, 'paid', sample.final_status, now() - sample.age / 2);
    end if;
  end loop;
end;
$$;

-- `create or replace` keeps the existing (revoked) grants, but be explicit.
revoke all on function private.seed_demo_data(uuid) from public, anon, authenticated;

-- Deliberately NOT re-seeding here: on production that would wipe the
-- current day's demo activity at deploy time. The nightly reset picks up the
-- new baseline; locally, supabase/seed.sql re-seeds after every reset.
