-- Welcome email on sign-up, and the outbox changes it needs.
--
-- email_outbox rows pointed at an order or a message. They can now point at a
-- subscriber too (and later at product alerts), so the check becomes "exactly
-- one reference" and the kind check gains the new kind.
--
-- queue_email_capped is how automatic emails get queued under a daily cap, so
-- they can't eat Resend's free quota (100 a day, shared with receipts):
--   * over the cap with p_skip_over_cap, the row is recorded as skipped (the
--     welcome email: a missed welcome is fine, a queue that never drains isn't);
--   * over the cap without it, nothing is queued and the caller tries again
--     tomorrow (alerts and nudges, which are still wanted).
-- The cap counts today's (UTC) rows of that kind that were, or will be, sent.
-- p_key_suffix lets a kind be sent again for a new occasion (a welcome after a later re-subscribe).
-- A lock per kind makes two simultaneous sign-ups unable to both take the last place.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.email_outbox
  add column subscriber_id uuid references public.newsletter_subscribers (id) on delete cascade;

do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.email_outbox'::regclass and contype = 'c'
              and (pg_get_constraintdef(oid) like '%order_id IS NULL%' or pg_get_constraintdef(oid) like '%''staff.message''%')
  loop
    execute format('alter table public.email_outbox drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.email_outbox
  add constraint email_outbox_one_reference check (num_nonnulls(order_id, message_id, subscriber_id) = 1),
  add constraint email_outbox_kind_check check (kind in ('order.paid', 'order.shipped', 'staff.order_paid', 'staff.message', 'subscriber.welcome'));

create or replace function public.queue_email_capped(
  p_tenant uuid, p_kind text, p_ref_col text, p_ref uuid, p_cap int, p_skip_over_cap boolean default false, p_key_suffix text default ''
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_key text := p_kind || ':' || p_ref || case when p_key_suffix = '' then '' else ':' || p_key_suffix end;
  v_used int;
begin
  if p_ref_col not in ('order_id', 'message_id', 'subscriber_id') then
    raise exception 'unsupported reference column %', p_ref_col;
  end if;
  if exists (select 1 from public.email_outbox where dedupe_key = v_key) then return 'duplicate'; end if;

  perform pg_advisory_xact_lock(hashtext('queue_email_capped:' || p_kind));
  select count(*) into v_used from public.email_outbox
   where tenant_id = p_tenant and kind = p_kind and status in ('queued', 'sending', 'sent', 'failed')
     and created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');

  if v_used >= p_cap then
    if p_skip_over_cap then
      execute format('insert into public.email_outbox (tenant_id, kind, %I, dedupe_key, status, last_error) values ($1, $2, $3, $4, ''skipped'', ''over the daily cap'') on conflict (dedupe_key) do nothing', p_ref_col)
        using p_tenant, p_kind, p_ref, v_key;
    end if;
    return 'capped';
  end if;
  execute format('insert into public.email_outbox (tenant_id, kind, %I, dedupe_key) values ($1, $2, $3, $4) on conflict (dedupe_key) do nothing', p_ref_col)
    using p_tenant, p_kind, p_ref, v_key;
  return 'queued';
end $$;
revoke all on function public.queue_email_capped(uuid, text, text, uuid, int, boolean, text) from public, anon, authenticated;
grant execute on function public.queue_email_capped(uuid, text, text, uuid, int, boolean, text) to service_role;

commit;
