-- Unfinished-checkout reminder.
--
-- When a checkout begins, the server asks Resend to send one reminder two hours
-- later (Resend's scheduled sending: there is no hourly job on this plan) and
-- keeps the Resend id here, so the reminder can be cancelled when the checkout
-- is paid or cancelled.
--
-- claim_checkout_reminder decides, under a lock, whether this checkout may have
-- a reminder at all: one per checkout, one per email address per 24 hours,
-- and a daily cap store-wide so reminders can't eat Resend's free quota. A
-- reminder that was cancelled never went out, so it counts for neither limit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.checkouts
  add column reminder_scheduled_at timestamptz,
  add column reminder_email_id text check (reminder_email_id is null or length(reminder_email_id) <= 100),
  add column reminder_cancelled_at timestamptz;
create index checkouts_reminder_idx on public.checkouts (tenant_id, lower(email), reminder_scheduled_at)
  where reminder_scheduled_at is not null;

create or replace function public.claim_checkout_reminder(p_checkout uuid, p_daily_cap int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.checkouts;
begin
  select * into v from public.checkouts where id = p_checkout for update;
  if not found then return 'missing'; end if;
  if v.status <> 'open' or v.order_id is not null then return 'closed'; end if;
  if v.reminder_scheduled_at is not null then return 'duplicate'; end if;

  perform pg_advisory_xact_lock(hashtext('claim_checkout_reminder'));
  if exists (select 1 from public.checkouts c
              where c.tenant_id = v.tenant_id and lower(c.email) = lower(v.email) and c.id <> v.id
                and c.reminder_scheduled_at > now() - interval '24 hours' and c.reminder_cancelled_at is null) then
    return 'recent';
  end if;
  if (select count(*) from public.checkouts c
       where c.tenant_id = v.tenant_id and c.reminder_scheduled_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
         and c.reminder_cancelled_at is null) >= p_daily_cap then
    return 'capped';
  end if;
  update public.checkouts set reminder_scheduled_at = now() where id = v.id;
  return 'ok';
end $$;
revoke all on function public.claim_checkout_reminder(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_checkout_reminder(uuid, int) to service_role;

commit;
