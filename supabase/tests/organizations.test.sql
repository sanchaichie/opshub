begin;
select plan(20);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Two ordinary users (same email local part, to exercise slug uniqueness) and
-- one demo-flagged user. Inserting into auth.users fires the sign-up trigger.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alex@a.test', '{}', '{"full_name":"Alex Rivera"}'),
  ('00000000-0000-0000-0000-00000000000b', 'alex@b.test', '{}', '{}'),
  ('00000000-0000-0000-0000-0000000000de', 'demo@opshub.test', '{"demo":true}', '{}');

create temp table ids as
select
  (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-00000000000a') as org_a,
  (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-00000000000b') as org_b;
grant select on ids to authenticated, anon;

-- ── Sign-up trigger ─────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.memberships where user_id = '00000000-0000-0000-0000-00000000000a'),
  1, 'sign-up creates exactly one membership'
);
select is(
  (select role from public.memberships where user_id = '00000000-0000-0000-0000-00000000000a'),
  'owner'::public.member_role, 'the new user owns their personal org'
);
select is(
  (select name from public.organizations where id = (select org_a from ids)),
  'Alex Rivera''s workspace', 'org is named after the user''s full name'
);
select isnt(
  (select slug from public.organizations where id = (select org_a from ids)),
  (select slug from public.organizations where id = (select org_b from ids)),
  'users with the same email local part get distinct slugs'
);
select is(
  (select count(*)::int from public.memberships where user_id = '00000000-0000-0000-0000-0000000000de'),
  0, 'the demo user gets no personal org'
);
select is(
  (select is_demo from public.organizations where id = (select org_a from ids)),
  false, 'personal orgs are never demo orgs'
);

-- ── As user A ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq(
  'select id from public.organizations',
  'select org_a from ids',
  'user A sees only their own org'
);
select is(
  (select count(*)::int from public.memberships where org_id = (select org_b from ids)),
  0, 'user A cannot see org B''s memberships'
);
select ok(
  (select private.is_org_member((select org_a from ids))) and not (select private.is_org_member((select org_b from ids))),
  'is_org_member is true for A''s org and false for B''s'
);
select ok(
  (select private.has_org_role((select org_a from ids), '{owner}')) and not (select private.has_org_role((select org_b from ids), '{owner,admin,member}')),
  'has_org_role respects org and role'
);
select throws_ok(
  $$ insert into public.organizations (name, slug) values ('Sneaky', 'sneaky-org') $$,
  '42501', null, 'browser cannot create orgs'
);
select throws_ok(
  $$ update public.organizations set is_demo = true $$,
  '42501', null, 'browser cannot update orgs (e.g. flip is_demo)'
);
select throws_ok(
  $$ insert into public.memberships (org_id, user_id, role)
     values ((select org_b from ids), '00000000-0000-0000-0000-00000000000a', 'owner') $$,
  '42501', null, 'browser cannot add itself to another org'
);
select throws_ok(
  $$ delete from public.memberships $$,
  '42501', null, 'browser cannot remove memberships'
);

-- ── As an anonymous visitor ─────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.organizations $$,
  '42501', null, 'anon has no access to organizations'
);

-- Privilege checks run as the superuser: anon can't even resolve names in
-- the private schema, which is part of the point.
reset role;
select ok(
  not has_function_privilege('anon', 'private.is_org_member(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.has_org_role(uuid, public.member_role[])', 'execute'),
  'anon cannot call the RLS helpers'
);
select ok(
  not has_function_privilege('anon', 'private.create_personal_org()', 'execute')
  and not has_function_privilege('authenticated', 'private.create_personal_org()', 'execute'),
  'nobody but the trigger can run create_personal_org'
);
select ok(
  not has_table_privilege('anon', 'public.memberships', 'select'),
  'anon has no access to memberships'
);
select ok(
  not has_table_privilege('authenticated', 'public.organizations', 'references')
  and not has_table_privilege('authenticated', 'public.organizations', 'trigger'),
  'authenticated only holds SELECT on organizations'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      -- A null ACL means "defaults", i.e. PUBLIC can execute.
      and (p.proacl is null or p.proacl::text ~ '(^\{|,)=X')
  ),
  'no function in private is executable by PUBLIC'
);

select * from finish();
rollback;
