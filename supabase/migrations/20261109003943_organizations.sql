-- Multi-tenant foundation: organizations, memberships, and the helper
-- functions every RLS policy in this project uses.
--
-- Access model (applies to every org-scoped table that follows):
--   * The browser only READS, through RLS, and only rows of orgs it belongs to.
--   * Every write goes through a server route that checks the caller's role
--     (requireOrgRole) and then uses the service role. So there are no
--     insert/update/delete policies for `authenticated`, and demo-mode
--     restrictions live in one place: the server.

-- ── Private schema hygiene ──────────────────────────────────────────────────
-- Postgres grants EXECUTE on every new function to PUBLIC. A schema-level
-- `alter default privileges ... revoke` can't remove that global default, so
-- every function below revokes it explicitly and then opts roles in.

-- RLS policies run as the calling role, which needs to reach the helpers below.
-- Tables in `private` stay unreadable: they have no grants and no policies.
grant usage on schema private to authenticated;

-- Keeps updated_at honest without relying on every caller to set it.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- ── Tables ──────────────────────────────────────────────────────────────────
create type public.member_role as enum ('owner', 'admin', 'member');

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  -- The shared public demo org. Nightly reset and demo restrictions key off this.
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.memberships (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- The PK covers lookups by org; RLS checks and "my orgs" look up by user.
create index memberships_user_id_idx on public.memberships (user_id);

-- ── RLS helpers ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies on `memberships` itself can call them without
-- recursing into memberships' own RLS.

create function private.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = org
      and m.user_id = (select auth.uid())
  );
$$;

create function private.has_org_role(org uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = org
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_role(uuid, public.member_role[]) from public, anon, authenticated;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.has_org_role(uuid, public.member_role[]) to authenticated, service_role;

-- ── Grants + policies ───────────────────────────────────────────────────────
-- Supabase grants full table access to API roles by default; narrow it to
-- read-only for signed-in users and nothing for anonymous visitors.
revoke all on public.organizations, public.memberships from anon, authenticated;
grant select on public.organizations, public.memberships to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

create policy "organizations: members can read"
  on public.organizations for select
  to authenticated
  using (private.is_org_member(id));

create policy "memberships: members can read their org's members"
  on public.memberships for select
  to authenticated
  using (private.is_org_member(org_id));

-- ── Personal org on sign-up ─────────────────────────────────────────────────
-- Every new user gets an org they own, so the app never has to handle
-- "signed in but belongs to nothing".
--
-- The demo-flag check below only applies to users inserted directly in SQL
-- (tests, fixtures). GoTrue's admin createUser writes app_metadata AFTER the
-- insert, so demo visitors created by /api/demo/login DO get a workspace
-- here; that route removes it, and the nightly reset sweeps any leftovers.

create function private.create_personal_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
  base_slug    text;
  new_org_id   uuid;
begin
  if coalesce((new.raw_app_meta_data ->> 'demo')::boolean, false) then
    return new;
  end if;

  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );

  base_slug := trim(both '-' from regexp_replace(lower(coalesce(display_name, 'personal')), '[^a-z0-9]+', '-', 'g'));
  if char_length(base_slug) < 2 then
    base_slug := 'org';
  end if;

  -- 12 hex chars of a hash of the user id keep slugs unique without a retry
  -- loop. Hashing (rather than slicing the id) gives uniform bits even for
  -- non-random ids, e.g. fixtures; a clash needs a 48-bit collision.
  insert into public.organizations (name, slug)
  values (
    case when display_name is null then 'Personal workspace'
         else left(display_name || '''s workspace', 80) end,
    left(base_slug, 48) || '-' || left(md5(new.id::text), 12)
  )
  returning id into new_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

-- Only ever invoked by the trigger.
revoke all on function private.create_personal_org() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_personal_org();
