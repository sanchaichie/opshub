-- Orders, customers, the event log/queue, connections and usage counters.
--
-- Same access model as the organizations migration: members READ their org's
-- rows through RLS; all writes come from server routes using the service role.
-- Internal state (Vault references, rate-limit counters) lives in `private`.
--
-- Tenant integrity: every reference between org-scoped rows is a COMPOSITE
-- foreign key, (org_id, x_id) -> (org_id, id). A row can therefore never point
-- at another org's row, so a cascade or SET NULL from one org's delete can
-- never reach into another org. The nightly demo reset relies on this.
-- SET NULL actions name only the id column (Postgres 15+), keeping org_id.

-- ── Enums ───────────────────────────────────────────────────────────────────
create type public.order_status as enum (
  'pending', 'paid', 'label_created', 'in_transit', 'out_for_delivery',
  'delivered', 'exception', 'stuck', 'cancelled'
);
create type public.order_source as enum ('checkout', 'simulated');
create type public.event_direction as enum ('inbound', 'outbound', 'internal');
create type public.event_status as enum ('pending', 'processing', 'succeeded', 'failed', 'dead', 'ignored');
create type public.connection_status as enum ('connected', 'error', 'revoked');
create type public.ai_output_kind as enum ('summary', 'reply_draft');

-- ── Customers ───────────────────────────────────────────────────────────────
create table public.customers (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  email               text not null check (email = lower(email) and email like '%@%'),
  name                text,
  stripe_customer_id  text,
  hubspot_contact_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, email),
  unique (org_id, id)  -- target of org-scoped foreign keys
);

-- ── Orders ──────────────────────────────────────────────────────────────────
create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations (id) on delete cascade,
  customer_id               uuid,
  status                    public.order_status not null default 'pending',
  source                    public.order_source not null,
  amount_cents              integer not null check (amount_cents >= 0),
  currency                  text not null check (currency ~ '^[a-z]{3}$'),
  line_items                jsonb not null default '[]' check (jsonb_typeof(line_items) = 'array'),
  -- One order per payment, whichever path (Checkout or Simulate) created it.
  stripe_payment_intent_id  text unique,
  easypost_shipment_id      text,
  tracking_code             text,
  carrier                   text,
  hubspot_deal_id           text,
  status_changed_at         timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, customer_id) references public.customers (org_id, id) on delete set null (customer_id)
);

create index orders_org_created_idx on public.orders (org_id, created_at desc);
create index orders_customer_id_idx on public.orders (customer_id);
-- Stuck-order detection scans by status and age.
create index orders_status_changed_idx on public.orders (status, status_changed_at);

-- ── Events: the audit log AND the job queue (ADR 0004) ──────────────────────
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  -- Null only for an inbound webhook whose org couldn't be resolved yet; such
  -- rows are invisible to every browser user (is_org_member(null) is false).
  org_id           uuid references public.organizations (id) on delete cascade,
  direction        public.event_direction not null,
  provider         text not null check (provider ~ '^[a-z][a-z0-9_]{1,30}$'),
  type             text not null,
  status           public.event_status not null default 'pending',
  external_id      text,
  idempotency_key  text,
  order_id         uuid,
  parent_event_id  uuid,
  -- Redacted before insert (server/utils/http.ts); never contains tokens.
  request          jsonb,
  response         jsonb,
  http_status      integer,
  error            text,
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  processed_at     timestamptz,

  -- Idempotency: a provider's event is stored once, an action is enqueued once.
  unique (provider, external_id),
  unique (provider, idempotency_key),
  check (direction <> 'inbound' or external_id is not null),
  check (direction <> 'outbound' or idempotency_key is not null),

  unique (org_id, id),
  -- An event without an org can't link to anything: composite foreign keys
  -- skip their check when a column is null, so forbid that case outright.
  check (org_id is not null or (order_id is null and parent_event_id is null)),
  foreign key (org_id, order_id) references public.orders (org_id, id) on delete set null (order_id),
  foreign key (org_id, parent_event_id) references public.events (org_id, id) on delete set null (parent_event_id)
);

create index events_org_created_idx on public.events (org_id, created_at desc);
create index events_order_id_idx on public.events (order_id);
create index events_parent_event_id_idx on public.events (parent_event_id);
-- The worker's claim query only ever looks at runnable rows, so a partial
-- index on next_attempt_at (filtered by status) replaces a (status,
-- next_attempt_at) composite and stays small as succeeded events pile up.
create index events_runnable_idx on public.events (next_attempt_at)
  where status in ('pending', 'failed', 'processing');

create table public.event_attempts (
  id           bigint generated always as identity primary key,
  event_id     uuid not null references public.events (id) on delete cascade,
  org_id       uuid references public.organizations (id) on delete cascade,
  attempt_no   integer not null check (attempt_no >= 1),
  started_at   timestamptz not null default now(),
  duration_ms  integer check (duration_ms >= 0),
  http_status  integer,
  error        text,
  response     jsonb,
  unique (event_id, attempt_no),
  -- event_id's plain FK covers org-less events; this one pins the org.
  foreign key (org_id, event_id) references public.events (org_id, id) on delete cascade
);

create index event_attempts_org_id_idx on public.event_attempts (org_id);

-- ── Order status history (drives the order timeline) ────────────────────────
create table public.order_status_history (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  order_id     uuid not null,
  from_status  public.order_status,
  to_status    public.order_status not null,
  event_id     uuid,
  created_at   timestamptz not null default now(),
  foreign key (org_id, order_id) references public.orders (org_id, id) on delete cascade,
  foreign key (org_id, event_id) references public.events (org_id, id) on delete set null (event_id)
);

create index order_status_history_order_idx on public.order_status_history (order_id, created_at);
create index order_status_history_org_id_idx on public.order_status_history (org_id);
create index order_status_history_event_id_idx on public.order_status_history (event_id);

-- ── Connections (secrets live in Vault, referenced from `private`) ──────────
create table public.connections (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  provider             text not null check (provider ~ '^[a-z][a-z0-9_]{1,30}$'),
  status               public.connection_status not null default 'connected',
  account_label        text,
  external_account_id  text,
  scopes               text[] not null default '{}',
  token_expires_at     timestamptz,
  -- Non-secret settings only (e.g. Slack channel id). Never tokens.
  metadata             jsonb not null default '{}',
  connected_by         uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, provider)
);

create index connections_connected_by_idx on public.connections (connected_by);

create table private.connection_secrets (
  connection_id    uuid primary key references public.connections (id) on delete cascade,
  vault_secret_id  uuid not null unique,
  updated_at       timestamptz not null default now()
);

alter table private.connection_secrets enable row level security;
-- No policies: only reachable through the service-role functions below.

-- ── AI outputs ──────────────────────────────────────────────────────────────
create table public.ai_outputs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  order_id       uuid not null,
  kind           public.ai_output_kind not null,
  model          text not null,
  content        text not null,
  input_tokens   integer not null default 0 check (input_tokens >= 0),
  output_tokens  integer not null default 0 check (output_tokens >= 0),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (org_id, order_id) references public.orders (org_id, id) on delete cascade
);

create index ai_outputs_order_idx on public.ai_outputs (order_id, created_at desc);
create index ai_outputs_org_id_idx on public.ai_outputs (org_id);
create index ai_outputs_created_by_idx on public.ai_outputs (created_by);

-- ── Usage counters (rate limits + AI caps) ──────────────────────────────────
create table private.usage_counters (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);

alter table private.usage_counters enable row level security;
-- No policies: only reachable through public.bump_usage().

-- ── updated_at triggers ─────────────────────────────────────────────────────
create trigger customers_set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger events_set_updated_at before update on public.events
  for each row execute function private.set_updated_at();
create trigger connections_set_updated_at before update on public.connections
  for each row execute function private.set_updated_at();

-- ── Grants + RLS: members read, server writes ───────────────────────────────
revoke all on
  public.customers, public.orders, public.order_status_history, public.events,
  public.event_attempts, public.connections, public.ai_outputs
from anon, authenticated;

grant select on
  public.customers, public.orders, public.order_status_history, public.events,
  public.event_attempts, public.connections, public.ai_outputs
to authenticated;

alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_history enable row level security;
alter table public.events enable row level security;
alter table public.event_attempts enable row level security;
alter table public.connections enable row level security;
alter table public.ai_outputs enable row level security;

create policy "customers: members can read" on public.customers
  for select to authenticated using (private.is_org_member(org_id));
create policy "orders: members can read" on public.orders
  for select to authenticated using (private.is_org_member(org_id));
create policy "order_status_history: members can read" on public.order_status_history
  for select to authenticated using (private.is_org_member(org_id));
create policy "events: members can read" on public.events
  for select to authenticated using (private.is_org_member(org_id));
create policy "event_attempts: members can read" on public.event_attempts
  for select to authenticated using (private.is_org_member(org_id));
create policy "connections: members can read" on public.connections
  for select to authenticated using (private.is_org_member(org_id));
create policy "ai_outputs: members can read" on public.ai_outputs
  for select to authenticated using (private.is_org_member(org_id));

-- ── Realtime: the dashboard's live feed ─────────────────────────────────────
-- RLS applies to Realtime too, so each subscriber only receives its org's rows.
alter publication supabase_realtime add table public.events, public.orders;

-- ── Service-role functions ──────────────────────────────────────────────────
-- In `public` so the server can call them over PostgREST; execution is revoked
-- from everyone except service_role.

-- Atomically claims a batch of runnable events for the worker. SKIP LOCKED
-- lets several workers run at once without double-processing; rows stuck in
-- `processing` for 5+ minutes (a crashed worker) become claimable again.
create function public.claim_events(batch integer default 10)
returns setof public.events
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A worker that crashed during an event's LAST allowed attempt leaves it
  -- `processing` with no attempts left. Without this it would never be
  -- claimed again and the inspector would show it running forever.
  update public.events e
  set status = 'dead',
      locked_at = null,
      error = coalesce(e.error, 'Gave up: the worker stopped during the final attempt.')
  where e.attempts >= e.max_attempts
    and (
      e.status = 'failed'
      or (e.status = 'processing' and e.locked_at < now() - interval '5 minutes')
    );

  return query
  update public.events e
  set status = 'processing',
      locked_at = now(),
      attempts = e.attempts + 1
  where e.id in (
    select c.id
    from public.events c
    where c.next_attempt_at <= now()
      and c.attempts < c.max_attempts
      and (
        c.status in ('pending', 'failed')
        or (c.status = 'processing' and c.locked_at < now() - interval '5 minutes')
      )
    order by c.next_attempt_at
    limit least(greatest(batch, 1), 100)
    for update skip locked
  )
  returning e.*;
end;
$$;

-- Fixed-window counter. Returns whether this hit is within the limit.
create function public.bump_usage(counter_key text, window_size interval, max_count integer)
returns table (allowed boolean, current_count integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz := date_bin(window_size, now(), timestamptz 'epoch');
  n   integer;
begin
  insert into private.usage_counters as u (key, window_start, count)
  values (counter_key, win, 1)
  on conflict (key, window_start) do update set count = u.count + 1
  returning u.count into n;

  return query select n <= max_count, n, win + window_size;
end;
$$;

-- Moves an order to a new status and records the transition in one step, so
-- the timeline can never disagree with the order row.
create function public.transition_order(target_order uuid, new_status public.order_status, caused_by uuid default null)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.order_status;
  updated  public.orders;
begin
  select o.status into previous from public.orders o where o.id = target_order for update;
  if not found then
    raise exception 'order % not found', target_order using errcode = 'P0002';
  end if;

  -- The causing event must belong to the same org, so a timeline can never
  -- link to another tenant's event.
  if caused_by is not null and not exists (
    select 1 from public.events ev
    where ev.id = caused_by
      and ev.org_id = (select o.org_id from public.orders o where o.id = target_order)
  ) then
    raise exception 'event % does not belong to order %''s org', caused_by, target_order using errcode = '23503';
  end if;

  if previous = new_status then
    select * into updated from public.orders where id = target_order;
    return updated;
  end if;

  update public.orders
  set status = new_status, status_changed_at = now()
  where id = target_order
  returning * into updated;

  insert into public.order_status_history (org_id, order_id, from_status, to_status, event_id)
  values (updated.org_id, target_order, previous, new_status, caused_by);

  return updated;
end;
$$;

-- Stores or rotates a connection's credentials (a JSON string) in Vault.
create function public.set_connection_secret(connection uuid, secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
  created  uuid;
begin
  select cs.vault_secret_id into existing
  from private.connection_secrets cs
  where cs.connection_id = connection;

  if existing is not null then
    perform vault.update_secret(existing, secret);
    update private.connection_secrets set updated_at = now() where connection_id = connection;
  else
    created := vault.create_secret(secret, 'connection:' || connection::text, 'OpsHub connection credentials');
    insert into private.connection_secrets (connection_id, vault_secret_id) values (connection, created);
  end if;
end;
$$;

create function public.get_connection_secret(connection uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from private.connection_secrets cs
  join vault.decrypted_secrets ds on ds.id = cs.vault_secret_id
  where cs.connection_id = connection;
$$;

-- Deleting a connection cascades to connection_secrets; this removes the
-- Vault entry too, so revoked credentials don't linger encrypted at rest.
create function private.delete_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;

create trigger connection_secrets_delete_vault
  after delete on private.connection_secrets
  for each row execute function private.delete_vault_secret();

revoke execute on function
  public.claim_events(integer),
  public.bump_usage(text, interval, integer),
  public.transition_order(uuid, public.order_status, uuid),
  public.set_connection_secret(uuid, text),
  public.get_connection_secret(uuid),
  private.delete_vault_secret()
from public, anon, authenticated;

grant execute on function
  public.claim_events(integer),
  public.bump_usage(text, interval, integer),
  public.transition_order(uuid, public.order_status, uuid),
  public.set_connection_secret(uuid, text),
  public.get_connection_secret(uuid)
to service_role;
