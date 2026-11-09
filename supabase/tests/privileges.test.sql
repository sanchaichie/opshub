begin;
select plan(2);

-- Project-wide guard: Postgres grants EXECUTE to PUBLIC on every new function,
-- and only an explicit per-function revoke removes it. This checks every
-- function this project defines (extension-owned ones excluded), so a future
-- migration that forgets the revoke fails CI.
select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', '), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     -- A null ACL means "defaults", i.e. PUBLIC can execute.
     and (p.proacl is null or p.proacl::text ~ '(^\{|,)=X')),
  '',
  'no project function is executable by PUBLIC'
);

select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', '), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'execute')),
  '',
  'anon cannot execute any project function'
);

select * from finish();
rollback;
