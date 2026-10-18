-- Transactional email outbox (sent through Resend).
--
-- Database triggers queue each email in the same transaction as the change
-- that causes it, whichever path made the change (checkout redirect, webhook,
-- reconciliation job, staff). A unique dedupe key means each email is queued
-- at most once. The server claims queued rows, renders them from the current
-- order or message, and sends them; failures are retried by later runs.
--
-- Rows hold ids only, never addresses or content: recipients are read from
-- the order or message at send time.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.email_outbox (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('order.paid', 'order.shipped', 'staff.order_paid', 'staff.message')),
  order_id uuid references public.orders (id) on delete cascade,
  message_id uuid references public.contact_messages (id) on delete cascade,
  dedupe_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  locked_until timestamptz,
  last_error text check (last_error is null or length(last_error) <= 500),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((order_id is null) <> (message_id is null))
);
create index email_outbox_pending_idx on public.email_outbox (created_at)
  where status in ('queued', 'sending', 'failed');

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;
grant all on public.email_outbox to service_role;

create or replace function private.enqueue_email(
  p_tenant uuid, p_kind text, p_order uuid, p_message uuid
) returns void language sql security definer set search_path = '' as $$
  insert into public.email_outbox (tenant_id, kind, order_id, message_id, dedupe_key)
  values (p_tenant, p_kind, p_order, p_message, p_kind || ':' || coalesce(p_order, p_message)::text)
  on conflict (dedupe_key) do nothing
$$;

-- Orders: receipt and staff alert when paid; shipping notice when shipped.
-- A payment that lands on an already-cancelled order alerts staff (who must
-- refund it) but sends the customer no receipt.
create or replace function private.email_from_orders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    perform private.enqueue_email(new.tenant_id, 'staff.order_paid', new.id, null);
    if new.status <> 'cancelled' then
      perform private.enqueue_email(new.tenant_id, 'order.paid', new.id, null);
    end if;
  end if;
  if new.status = 'shipped' and old.status is distinct from 'shipped' then
    perform private.enqueue_email(new.tenant_id, 'order.shipped', new.id, null);
  end if;
  return null;
end $$;
create trigger orders_email after update of status, payment_status on public.orders
  for each row execute function private.email_from_orders();

create or replace function private.email_from_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_email(new.tenant_id, 'staff.message', null, new.id);
  return null;
end $$;
create trigger contact_messages_email after insert on public.contact_messages
  for each row execute function private.email_from_messages();

-- Claims up to p_limit emails for sending. Rows already being sent are
-- skipped (SKIP LOCKED), so concurrent senders never take the same row; a
-- claim whose sender died is retaken after its lock expires. Emails still
-- unsent after 3 days are dropped rather than arriving late.
create or replace function public.claim_email_outbox(p_limit int default 10, p_max_attempts int default 5)
returns setof public.email_outbox
language plpgsql security invoker set search_path = '' as $$
begin
  update public.email_outbox set status = 'skipped', last_error = 'expired before it could be sent', locked_until = null
   where status in ('queued', 'failed', 'sending') and created_at < now() - interval '3 days'
     and attempts < p_max_attempts and (status <> 'sending' or locked_until < now());

  return query
  update public.email_outbox o
     set status = 'sending', attempts = o.attempts + 1, locked_until = now() + interval '5 minutes'
   where o.id in (
     select id from public.email_outbox
      where (status in ('queued', 'failed') or (status = 'sending' and locked_until < now()))
        and attempts < p_max_attempts
      order by created_at
      limit least(greatest(coalesce(p_limit, 10), 1), 50)
      for update skip locked)
  returning o.*;
end $$;
revoke all on function public.claim_email_outbox(int, int) from public, anon, authenticated;
grant execute on function public.claim_email_outbox(int, int) to service_role;

-- Retention: the outbox log is kept 13 months, like analytics.
create or replace function public.run_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events int; v_limits int; v_salts int; v_activity int; v_emails int;
begin
  delete from public.analytics_events where occurred_at < now() - interval '13 months';
  get diagnostics v_events = row_count;
  delete from private.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_limits = row_count;
  delete from private.analytics_salts where day < (now() at time zone 'UTC')::date - 1;
  get diagnostics v_salts = row_count;
  delete from public.activity_feed where occurred_at < now() - interval '90 days';
  get diagnostics v_activity = row_count;
  delete from public.email_outbox where created_at < now() - interval '13 months' and status in ('sent', 'skipped', 'failed');
  get diagnostics v_emails = row_count;
  return jsonb_build_object('analyticsEvents', v_events, 'rateLimitWindows', v_limits,
                            'analyticsSalts', v_salts, 'activity', v_activity, 'emails', v_emails);
end $$;
revoke all on function public.run_retention() from public, anon, authenticated;
grant execute on function public.run_retention() to service_role;

revoke all on all functions in schema private from public, anon;
revoke all on function private.enqueue_email(uuid, text, uuid, uuid), private.email_from_orders(),
  private.email_from_messages() from authenticated;

commit;
