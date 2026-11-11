begin;
select plan(3);

\set demo '''de300000-0000-4000-8000-000000000001'''

-- Two demo visitors and one real org with two members.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'v1@demo.example.com', '{"demo":true}', '{}'),
  ('00000000-0000-0000-0000-0000000000e2', 'v2@demo.example.com', '{"demo":true}', '{}'),
  ('00000000-0000-0000-0000-0000000000f1', 'owner@real.test', '{}', '{}'),
  ('00000000-0000-0000-0000-0000000000f2', 'colleague@real.test', '{}', '{}');
insert into public.memberships (org_id, user_id, role) values
  (:demo, '00000000-0000-0000-0000-0000000000e1', 'member'),
  (:demo, '00000000-0000-0000-0000-0000000000e2', 'member'),
  ((select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'), '00000000-0000-0000-0000-0000000000f2', 'member');

insert into public.ai_outputs (org_id, order_id, kind, model, content, created_by)
select :demo, (select id from public.orders where org_id = :demo limit 1), 'reply_draft', 'm', 'visitor 1 draft', '00000000-0000-0000-0000-0000000000e1';

insert into public.orders (org_id, source, amount_cents, currency, stripe_payment_intent_id)
select org_id, 'checkout', 100, 'usd', 'pi_ai_rls' from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1' and role = 'owner';
insert into public.ai_outputs (org_id, order_id, kind, model, content, created_by)
select o.org_id, o.id, 'summary', 'm', 'owner summary', '00000000-0000-0000-0000-0000000000f1' from public.orders o where o.stripe_payment_intent_id = 'pi_ai_rls';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select is((select count(*)::int from public.ai_outputs where content = 'visitor 1 draft'), 0, 'a demo visitor cannot see another visitor''s AI output');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select is((select count(*)::int from public.ai_outputs where content = 'visitor 1 draft'), 1, 'a demo visitor sees their own');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select is((select count(*)::int from public.ai_outputs where content = 'owner summary'), 1, 'in a real org, members share AI outputs');

select * from finish();
rollback;
