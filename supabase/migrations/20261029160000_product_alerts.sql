-- "Email me when it's available": back-in-stock and drop alerts.
--
-- A shopper on a sold-out or coming-soon product page leaves an address and
-- ticks a consent box. When the product can be bought, the daily job queues
-- one email per alert (email_outbox, kind product.available, capped per day)
-- and stamps notified_at. Each alert is its own unsubscribe token; the shared
-- /unsubscribe link removes it (newsletter_unsubscribe now handles both).
--
-- Server-only, like checkouts: the browser never reads or writes this table.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.product_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  consent_text text not null check (length(consent_text) between 10 and 1000),
  consented_at timestamptz not null default now(),
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index product_alerts_product_email_idx on public.product_alerts (product_id, lower(email));
create index product_alerts_waiting_idx on public.product_alerts (created_at) where notified_at is null;
create index product_alerts_tenant_idx on public.product_alerts (tenant_id);

alter table public.product_alerts enable row level security;
revoke all on public.product_alerts from anon, authenticated;
grant all on public.product_alerts to service_role;

-- One alert per product and address. Asking again (also after being told once)
-- re-arms it with fresh consent; the reply to the shopper never differs.
create or replace function public.subscribe_product_alert(p_tenant uuid, p_product text, p_email text, p_consent text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.product_alerts (tenant_id, product_id, email, consent_text)
  values (p_tenant, p_product, lower(btrim(p_email)), p_consent)
  on conflict (product_id, lower(email)) do update
    set notified_at = null, consent_text = excluded.consent_text, consented_at = now()
$$;
revoke all on function public.subscribe_product_alert(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.subscribe_product_alert(uuid, text, text, text) to service_role;

-- The outbox can point at an alert too.
alter table public.email_outbox
  add column alert_id uuid references public.product_alerts (id) on delete cascade;
alter table public.email_outbox drop constraint email_outbox_one_reference;
alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_one_reference check (num_nonnulls(order_id, message_id, subscriber_id, alert_id) = 1),
  add constraint email_outbox_kind_check check (kind in ('order.paid', 'order.shipped', 'staff.order_paid', 'staff.message', 'subscriber.welcome', 'product.available'));

-- Same function as before with alert_id accepted as a reference.
create or replace function public.queue_email_capped(
  p_tenant uuid, p_kind text, p_ref_col text, p_ref uuid, p_cap int, p_skip_over_cap boolean default false, p_key_suffix text default ''
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_key text := p_kind || ':' || p_ref || case when p_key_suffix = '' then '' else ':' || p_key_suffix end;
  v_used int;
begin
  if p_ref_col not in ('order_id', 'message_id', 'subscriber_id', 'alert_id') then
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

-- The unsubscribe link in alert emails carries the alert's own token.
create or replace function public.newsletter_unsubscribe(p_token uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  v_subscribed int;
  v_alerts int;
begin
  update public.newsletter_subscribers set unsubscribed_at = coalesce(unsubscribed_at, now())
   where unsubscribe_token = p_token;
  get diagnostics v_subscribed = row_count;
  delete from public.product_alerts where unsubscribe_token = p_token;
  get diagnostics v_alerts = row_count;
  return v_subscribed + v_alerts > 0;
end $$;

commit;
