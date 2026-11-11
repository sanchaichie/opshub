-- Token-weighted usage counters for AI cost caps.
--
-- bump_usage (orders_events migration) counts requests, one at a time. AI
-- cost scales with tokens, which are only known AFTER a call, so the AI
-- feature checks the running total before calling (read_usage) and adds
-- the real usage afterwards (add_usage). A cap can therefore be exceeded by
-- the calls already in flight when it's reached (one per concurrent request),
-- which is the accepted trade-off for a soft daily budget.
--
-- Same table and nightly purge as the request counters, so windows are at
-- most one day (the purge keeps two). Token keys must start with `tokens:`,
-- so a token total can never be mixed up with a request counter's key.

comment on table private.usage_counters is
  'Fixed-window counters. Requests: public.bump_usage. Tokens (keys starting with "tokens:"): public.add_usage / public.read_usage. Purged daily after 2 days.';

create function public.add_usage(counter_key text, window_size interval, amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  win   timestamptz := date_bin(window_size, now(), timestamptz 'epoch');
  total integer;
begin
  if amount is null or amount < 0 then
    raise exception 'add_usage: amount must be zero or more';
  end if;
  if counter_key not like 'tokens:%' then
    raise exception 'add_usage: token counter keys must start with "tokens:"';
  end if;
  if window_size > interval '1 day' then
    raise exception 'add_usage: windows longer than a day would be purged early';
  end if;

  insert into private.usage_counters as u (key, window_start, count)
  values (counter_key, win, amount)
  on conflict (key, window_start) do update set count = u.count + amount
  returning u.count into total;

  return total;
end;
$$;

create function public.read_usage(counter_key text, window_size interval)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.count from private.usage_counters u
    where u.key = counter_key
      and u.window_start = date_bin(window_size, now(), timestamptz 'epoch')
  ), 0);
$$;

revoke all on function public.add_usage(text, interval, integer) from public, anon, authenticated;
revoke all on function public.read_usage(text, interval) from public, anon, authenticated;
grant execute on function public.add_usage(text, interval, integer) to service_role;
grant execute on function public.read_usage(text, interval) to service_role;

-- ── AI outputs in the shared demo: each visitor sees only their own ─────────
-- In real orgs, members share AI summaries and drafts. In the public demo,
-- every visitor is a member of the same org, so a shared view would let one
-- visitor plant text (e.g. a phishing link in a "draft reply") for others to
-- read and copy. Demo visitors therefore only read outputs they created.
drop policy "ai_outputs: members can read" on public.ai_outputs;
create policy "ai_outputs: members can read (demo: own only)" on public.ai_outputs
  for select to authenticated
  using (
    private.is_org_member(org_id)
    and (
      created_by = (select auth.uid())
      or not exists (select 1 from public.organizations o where o.id = org_id and o.is_demo)
    )
  );
