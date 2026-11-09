-- Pending OAuth flows ("connect Slack" etc.).
--
-- The `state` sent to the provider is a random token; only its SHA-256 is
-- stored. Rows expire after 10 minutes and are deleted when consumed, so a
-- state works exactly once. The PKCE verifier lives here too, never in the
-- browser.

create table private.oauth_states (
  state_hash     text primary key,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- Shape-checked only: which providers exist is decided by the server's
  -- integration registry, and an unknown one never gets this far.
  provider       text not null check (provider ~ '^[a-z][a-z0-9_]{1,30}$'),
  code_verifier  text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '10 minutes'
);

create index oauth_states_expires_idx on private.oauth_states (expires_at);
create index oauth_states_org_idx on private.oauth_states (org_id);
create index oauth_states_user_idx on private.oauth_states (user_id);

alter table private.oauth_states enable row level security;
-- No policies: only reachable through the service-role functions below.

create function public.oauth_state_create(state_hash text, org uuid, member uuid, provider text, code_verifier text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Housekeeping: abandoned flows. Capped, so a burst of started-but-never-
  -- finished flows can't make every new one pay for the whole backlog.
  delete from private.oauth_states s
  where s.ctid in (select x.ctid from private.oauth_states x where x.expires_at < now() limit 500);

  insert into private.oauth_states (state_hash, org_id, user_id, provider, code_verifier)
  values (oauth_state_create.state_hash, org, member, oauth_state_create.provider, oauth_state_create.code_verifier);
end;
$$;

-- Atomically takes a state for the expected provider: returns it once, and
-- deletes it whether or not it has expired (so it can't be retried).
create function public.oauth_state_consume(state_hash text, expected_provider text)
returns table (org_id uuid, user_id uuid, provider text, code_verifier text, expired boolean)
language sql
security definer
set search_path = ''
as $$
  delete from private.oauth_states s
  where s.state_hash = oauth_state_consume.state_hash
    and s.provider = expected_provider
  returning s.org_id, s.user_id, s.provider, s.code_verifier, s.expires_at < now();
$$;

revoke all on function public.oauth_state_create(text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.oauth_state_consume(text, text) from public, anon, authenticated;
grant execute on function public.oauth_state_create(text, uuid, uuid, text, text) to service_role;
grant execute on function public.oauth_state_consume(text, text) to service_role;
