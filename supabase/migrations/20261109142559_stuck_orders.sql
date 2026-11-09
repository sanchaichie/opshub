-- Stuck-order detection.
--
-- Every 5 minutes, orders that stopped moving are marked `stuck`:
--   label_created for 48h+, or in_transit / out_for_delivery for 5 days+.
-- The demo uses minutes instead of days, so visitors can watch it happen.
--
-- Detection is SQL; the REACTION is TypeScript. For each stuck order this
-- enqueues an internal `opshub` / `order.stuck` event; the worker hands it to
-- server/integrations/opshub, which runs the same onOrderStatusChanged flow as
-- a tracking update (e.g. a Slack alert from Phase 3).

create function private.mark_stuck_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  evt_id    uuid;
  marked    integer := 0;
begin
  for candidate in
    select o.id, o.org_id, o.status, o.status_changed_at
    from public.orders o
    join public.organizations org on org.id = o.org_id
    -- Only orders with a real shipment can be stuck: without one there's no
    -- tracking to wait for (e.g. the demo's seeded baseline orders).
    where o.easypost_shipment_id is not null
      and ((o.status = 'label_created'
           and o.status_changed_at < now() - case when org.is_demo then interval '15 minutes' else interval '48 hours' end)
       or (o.status in ('in_transit', 'out_for_delivery')
           and o.status_changed_at < now() - case when org.is_demo then interval '30 minutes' else interval '5 days' end))
    -- Rows a webhook is updating right now are simply checked next run.
    for update of o skip locked
  loop
    insert into public.events (org_id, direction, provider, type, idempotency_key, order_id, request)
    values (
      candidate.org_id, 'internal', 'opshub', 'order.stuck',
      -- One event per stall: a later stall of the same order is a new event.
      -- Full microsecond precision, so two stalls can never share a key.
      'opshub.order_stuck:' || candidate.id || ':' || to_char(candidate.status_changed_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS.US'),
      candidate.id,
      jsonb_build_object('input', jsonb_build_object(
        'orderId', candidate.id,
        'previousStatus', candidate.status,
        'since', candidate.status_changed_at
      ))
    )
    on conflict (provider, idempotency_key) do nothing
    returning id into evt_id;

    -- This exact stall already has its event. Can't normally happen (the row
    -- lock and this single transaction make detection all-or-nothing), so
    -- skip it rather than fail the whole run.
    continue when evt_id is null;

    perform public.transition_order(candidate.id, 'stuck', evt_id);
    marked := marked + 1;
  end loop;

  return marked;
end;
$$;

revoke all on function private.mark_stuck_orders() from public, anon, authenticated;

select cron.schedule('detect-stuck-orders', '*/5 * * * *', 'select private.mark_stuck_orders()');
