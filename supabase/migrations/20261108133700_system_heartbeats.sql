-- Keep-alive heartbeats.
--
-- The Supabase free tier pauses a project after 7 days without external
-- activity. Two independent pingers (Vercel Cron and a GitHub Action) call
-- public.heartbeat() so the project always sees real reads and writes, and the
-- dashboard can show when each one last ran. See docs/decisions/0006.

-- Schema for internal tables and helpers. It is not exposed through the Data
-- API, so nothing in it is reachable from the browser.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.system_heartbeats (
  source     text primary key check (source in ('vercel-cron', 'github-actions', 'manual')),
  last_seen  timestamptz not null default now(),
  beats      bigint not null default 1
);

alter table private.system_heartbeats enable row level security;
-- No policies on purpose: only service_role (which bypasses RLS) may touch it.

-- Records a heartbeat and returns the state of every pinger.
-- In `public` only because PostgREST exposes `public`; execution is limited to
-- service_role below.
create function public.heartbeat(pinger text)
returns table (source text, last_seen timestamptz, beats bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  insert into private.system_heartbeats as h (source)
  values (pinger)
  on conflict on constraint system_heartbeats_pkey
  do update set last_seen = now(), beats = h.beats + 1;

  return query
    select h.source, h.last_seen, h.beats
    from private.system_heartbeats h
    order by h.source;
end;
$$;

revoke all on function public.heartbeat(text) from public, anon, authenticated;
grant execute on function public.heartbeat(text) to service_role;

-- Read-only view of the same data for the health endpoint.
create function public.heartbeat_status()
returns table (source text, last_seen timestamptz, beats bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select h.source, h.last_seen, h.beats
  from private.system_heartbeats h
  order by h.source;
$$;

revoke all on function public.heartbeat_status() from public, anon, authenticated;
grant execute on function public.heartbeat_status() to service_role;
