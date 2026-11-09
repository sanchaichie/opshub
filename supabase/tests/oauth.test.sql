begin;
select plan(10);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000c1', 'oauth@opshub.test', '{}', '{}');
create temp table org as select org_id as id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000c1';

select public.oauth_state_create('hash-1', (select id from org), '00000000-0000-0000-0000-0000000000c1', 'slack', 'verifier-1');

select results_eq(
  $$ select provider, code_verifier, expired from public.oauth_state_consume('hash-1', 'slack') $$,
  $$ values ('slack'::text, 'verifier-1'::text, false) $$,
  'a fresh state is returned once with its PKCE verifier'
);
select is_empty($$ select * from public.oauth_state_consume('hash-1', 'slack') $$, 'the same state cannot be used twice');
select is_empty($$ select * from public.oauth_state_consume('never-issued', 'slack') $$, 'an unknown state returns nothing');

-- Expired: still consumed (deleted), but flagged.
select public.oauth_state_create('hash-2', (select id from org), '00000000-0000-0000-0000-0000000000c1', 'slack');
update private.oauth_states set expires_at = now() - interval '1 second' where state_hash = 'hash-2';
select results_eq($$ select expired from public.oauth_state_consume('hash-2', 'slack') $$, $$ values (true) $$, 'an expired state is reported as expired');

-- Creating a state sweeps abandoned ones.
insert into private.oauth_states (state_hash, org_id, user_id, provider, expires_at)
values ('stale', (select id from org), '00000000-0000-0000-0000-0000000000c1', 'slack', now() - interval '1 hour');
select public.oauth_state_create('hash-3', (select id from org), '00000000-0000-0000-0000-0000000000c1', 'slack');
select is((select count(*)::int from private.oauth_states where state_hash = 'stale'), 0, 'expired states are swept');
select is((select count(*)::int from private.oauth_states where state_hash = 'hash-3'), 1, 'live states survive the sweep');
select is_empty($$ select * from public.oauth_state_consume('hash-3', 'hubspot') $$, 'a state cannot be used for a different provider');
delete from public.organizations where id = (select id from org);
select is((select count(*)::int from private.oauth_states where state_hash = 'hash-3'), 0, 'deleting an org removes its pending flows');

select ok(
  not has_function_privilege('authenticated', 'public.oauth_state_create(text, uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.oauth_state_consume(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.oauth_state_consume(text, text)', 'execute'),
  'browser roles cannot create or consume OAuth states'
);
select ok(
  not has_table_privilege('authenticated', 'private.oauth_states', 'select'),
  'PKCE verifiers are unreadable from the browser'
);

select * from finish();
rollback;
