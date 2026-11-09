-- The shared public demo (ADR 0002).
--
-- * One demo org, created here with a fixed id so code and tests can find it.
-- * Each "Try demo" click creates a throwaway visitor account
--   (app_metadata.demo = true) that is a member of the demo org; see ADR 0007.
--   No demo password exists anywhere. Visitors older than a day are removed
--   by the nightly reset.
-- * private.reset_demo_data() wipes and re-seeds demo data nightly. It is the
--   ONLY reset that ever runs against production, and it can only touch orgs
--   with is_demo = true (proven in supabase/tests/demo.test.sql).

-- is_demo decides what the nightly reset may delete, so it is fixed at
-- creation: no bug, script or admin query can turn a real org into a demo
-- org (to be wiped at 03:00), or the demo org into a real one.
create function private.forbid_is_demo_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_demo is distinct from old.is_demo then
    raise exception 'organizations.is_demo cannot be changed after creation' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.forbid_is_demo_change() from public, anon, authenticated;

create trigger organizations_is_demo_immutable
  before update of is_demo on public.organizations
  for each row execute function private.forbid_is_demo_change();

insert into public.organizations (id, name, slug, is_demo)
values ('de300000-0000-4000-8000-000000000001', 'OpsHub Demo Store', 'opshub-demo', true)
on conflict (id) do nothing;

-- A believable starting point: a handful of past orders in different states,
-- each with the status history and Stripe event the real flow would produce.
create function private.seed_demo_data(demo_org uuid)
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
      ('Ava Silva',      'ava.silva@example.com',      'OpsHub Mug',          2, 1800, 'delivered'::public.order_status, interval '6 days'),
      ('Ben Okafor',     'ben.okafor@example.com',     'Uptime T-shirt',      1, 2900, 'in_transit',                     interval '2 days'),
      ('Chloe Novak',    'chloe.novak@example.com',    'Retry-Proof Hoodie',  1, 5900, 'label_created',                  interval '20 hours'),
      ('Dev Patel',      'dev.patel@example.com',      'Sticker Pack',        3,  600, 'stuck',                          interval '4 days'),
      ('Elena Haddad',   'elena.haddad@example.com',   'Incident Notebook',   1, 1200, 'paid',                           interval '35 minutes')
    ) as s(name, email, product, qty, unit, final_status, age)
  loop
    insert into public.customers (org_id, email, name)
    values (demo_org, sample.email, sample.name)
    returning id into cust_id;

    insert into public.orders (org_id, customer_id, status, source, amount_cents, currency, line_items,
                               stripe_payment_intent_id, created_at, status_changed_at)
    values (demo_org, cust_id, sample.final_status, 'simulated', sample.qty * sample.unit, 'usd',
            jsonb_build_array(jsonb_build_object('name', sample.product, 'quantity', sample.qty, 'unit_amount', sample.unit)),
            'pi_demo_' || replace(gen_random_uuid()::text, '-', ''),
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

-- Removes throwaway demo visitors (and any workspace only they belong to).
-- Keyed on app_metadata.demo, which users can't set themselves, so a real
-- account can never match.
create function private.purge_demo_visitors(older_than interval default interval '1 day')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Workspaces whose every member is a demo visitor. Normally none exist
  -- (/api/demo/login removes the visitor's auto-created workspace), but a
  -- failed cleanup must not leave them behind.
  delete from public.organizations o
  where not o.is_demo
    and exists (
      select 1 from public.memberships m join auth.users u on u.id = m.user_id
      where m.org_id = o.id and (u.raw_app_meta_data ->> 'demo')::boolean is true
    )
    and not exists (
      select 1 from public.memberships m join auth.users u on u.id = m.user_id
      where m.org_id = o.id and coalesce((u.raw_app_meta_data ->> 'demo')::boolean, false) = false
    );

  -- Cascades to their memberships; their sessions stop working.
  delete from auth.users u
  where (u.raw_app_meta_data ->> 'demo')::boolean is true
    and u.created_at < now() - older_than;
end;
$$;

-- Nightly reset. Deletes demo orgs' activity (orders, customers, events,
-- AI outputs) and re-seeds the baseline.
--
-- Why this can't touch a real org:
--   * every delete is scoped to a demo org id, and is_demo is immutable;
--   * every reference between org-scoped rows is a composite (org_id, id)
--     foreign key, so cascades and SET NULLs stay inside the demo org.
--
-- It deliberately KEEPS connections: the demo org stays connected to the
-- owner's sandbox accounts. That means anonymous visitors drive real
-- sandbox calls, which is the point of the demo (ADR 0002), so those calls
-- are rate-limited and restricted server-side (server/utils/auth.ts
-- forbidInDemo, server/utils/rate-limit.ts).
create function private.reset_demo_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo record;
begin
  -- Every statement below is scoped to this loop's demo org id; there is no
  -- unscoped delete anywhere in this function.
  perform private.purge_demo_visitors();

  -- Lock the demo orgs for the duration of the reset. Inserts into their
  -- tables need a key-share lock on the org row (foreign key check), so
  -- visitors' writes wait until the reset has finished, instead of landing
  -- half-way through it.
  for demo in select id from public.organizations where is_demo for update loop
    delete from public.ai_outputs where org_id = demo.id;
    -- Skip events a worker is processing right now; deleting them mid-run
    -- would make its attempt bookkeeping fail. They finish normally (their
    -- order link is nulled when the order is deleted) and go next night.
    delete from public.events
    where org_id = demo.id
      and not (status = 'processing' and locked_at > now() - interval '5 minutes');  -- cascades to event_attempts
    delete from public.orders where org_id = demo.id;  -- cascades to order_status_history
    delete from public.customers where org_id = demo.id;
    perform private.seed_demo_data(demo.id);
  end loop;
end;
$$;

revoke all on function private.seed_demo_data(uuid) from public, anon, authenticated;
revoke all on function private.reset_demo_data() from public, anon, authenticated;
revoke all on function private.purge_demo_visitors(interval) from public, anon, authenticated;

select cron.schedule('reset-demo', '0 3 * * *', 'select private.reset_demo_data()');

-- Start with the baseline. On a fresh database this only touches the demo
-- org inserted above (no other org has is_demo = true).
select private.reset_demo_data();
