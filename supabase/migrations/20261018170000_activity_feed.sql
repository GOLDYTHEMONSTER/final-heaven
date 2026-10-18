-- Activity feed: what just happened in the business, for staff notifications.
--
-- Written by database triggers on the business tables themselves, so every
-- event is recorded exactly when the change commits, whatever wrote it (API,
-- webhook, staff, job). Each entry names the permission needed to see it, and
-- RLS shows it only to staff holding that permission in that tenant.
-- Published to Supabase Realtime so admin updates live.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.activity_feed (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind text not null check (kind in (
    'order.placed', 'payment.received', 'payment.failed', 'order.cancelled',
    'message.received', 'subscriber.new', 'stock.low')),
  title text not null check (length(title) <= 200),
  detail text check (detail is null or length(detail) <= 300),
  link text check (link is null or link ~ '^/admin'),
  required_permission text not null references public.permissions (key)
);
create index activity_feed_tenant_time_idx on public.activity_feed (tenant_id, occurred_at desc);

-- When each staff member last looked at the feed, per tenant (unread = newer).
create table public.activity_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

create or replace function private.money_label(p_amount numeric, p_currency text) returns text
language sql immutable set search_path = '' as $$
  select case when p_currency = 'NGN' then '₦' else p_currency || ' ' end
         || to_char(p_amount, 'FM999,999,999,990.00')
$$;

create or replace function private.post_activity(
  p_tenant uuid, p_kind text, p_title text, p_detail text, p_link text, p_permission text
) returns void language sql security definer set search_path = '' as $$
  insert into public.activity_feed (tenant_id, kind, title, detail, link, required_permission)
  values (p_tenant, p_kind, left(p_title, 200), left(p_detail, 300), p_link, p_permission)
$$;

-- Orders: placed, paid, payment failed, cancelled.
create or replace function private.activity_from_orders() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_link text := '/admin/orders?q=' || new.order_number;
  v_amount text := private.money_label(new.total, new.currency);
begin
  if tg_op = 'INSERT' then
    perform private.post_activity(new.tenant_id, 'order.placed', 'New order ' || new.order_number,
      v_amount || coalesce(' · ' || new.shipping_city, ''), v_link, 'orders.read');
    return null;
  end if;
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    perform private.post_activity(new.tenant_id, 'payment.received', 'Payment received for ' || new.order_number,
      v_amount || ' · ready to fulfil', v_link, 'orders.read');
  elsif new.payment_status = 'failed' and old.payment_status is distinct from 'failed' then
    perform private.post_activity(new.tenant_id, 'payment.failed', 'Payment failed for ' || new.order_number,
      v_amount, v_link, 'payments.read');
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform private.post_activity(new.tenant_id, 'order.cancelled', 'Order ' || new.order_number || ' cancelled',
      v_amount, v_link, 'orders.read');
  end if;
  return null;
end $$;
create trigger orders_activity after insert or update of status, payment_status on public.orders
  for each row execute function private.activity_from_orders();

-- Contact form messages.
create or replace function private.activity_from_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.post_activity(new.tenant_id, 'message.received', 'New message from ' || new.name,
    case new.topic when 'order' then 'About an order' when 'return' then 'Return or refund'
      when 'privacy' then 'Personal data request' else 'General enquiry' end
      || coalesce(' · ' || new.order_number, ''),
    '/admin/messages', 'customers.read');
  return null;
end $$;
create trigger contact_messages_activity after insert on public.contact_messages
  for each row execute function private.activity_from_messages();

-- Newsletter: new sign-ups and re-subscriptions.
create or replace function private.activity_from_subscribers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (old.unsubscribed_at is not null and new.unsubscribed_at is null) then
    perform private.post_activity(new.tenant_id, 'subscriber.new', 'New newsletter subscriber',
      case new.source when 'membership_waitlist' then 'Joined the membership waitlist' else 'Signed up in the footer' end,
      '/admin/customers', 'customers.read');
  end if;
  return null;
end $$;
create trigger newsletter_activity after insert or update of unsubscribed_at on public.newsletter_subscribers
  for each row execute function private.activity_from_subscribers();

-- Stock: when an active product drops to 3 or fewer.
create or replace function private.activity_from_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and new.stock <= 3 and (tg_op = 'INSERT' or old.stock > 3) then
    perform private.post_activity(new.tenant_id, 'stock.low',
      case when new.stock = 0 then 'Sold out: ' else 'Low stock: ' end || new.name,
      new.stock || ' left', '/admin', 'products.read');
  end if;
  return null;
end $$;
create trigger products_stock_activity after insert or update of stock on public.products
  for each row execute function private.activity_from_stock();

-- Mark the feed as seen for the signed-in user.
create or replace function public.mark_activity_seen(p_tenant uuid) returns void
language sql security invoker set search_path = '' as $$
  insert into public.activity_seen (user_id, tenant_id, last_seen_at)
  values ((select auth.uid()), p_tenant, now())
  on conflict (user_id, tenant_id) do update set last_seen_at = excluded.last_seen_at
$$;

-- RLS
alter table public.activity_feed enable row level security;
alter table public.activity_seen enable row level security;
revoke all on public.activity_feed, public.activity_seen from anon, authenticated;
grant select on public.activity_feed to authenticated;
grant select, insert, update on public.activity_seen to authenticated;
grant all on public.activity_feed, public.activity_seen to service_role;

create policy "Staff see activity they have permission for" on public.activity_feed
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants(required_permission)));
create policy "Users manage their own seen marker" on public.activity_seen
  for all to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select private.member_tenants()))
  with check (user_id = (select auth.uid()) and tenant_id in (select private.member_tenants()));

revoke all on function public.mark_activity_seen(uuid) from public, anon;
grant execute on function public.mark_activity_seen(uuid) to authenticated;

-- Retention: keep 90 days of activity (it's a notification feed, not the
-- audit log, which keeps everything).
create or replace function public.run_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events int; v_limits int; v_salts int; v_activity int;
begin
  delete from public.analytics_events where occurred_at < now() - interval '13 months';
  get diagnostics v_events = row_count;
  delete from private.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_limits = row_count;
  delete from private.analytics_salts where day < (now() at time zone 'UTC')::date - 1;
  get diagnostics v_salts = row_count;
  delete from public.activity_feed where occurred_at < now() - interval '90 days';
  get diagnostics v_activity = row_count;
  return jsonb_build_object('analyticsEvents', v_events, 'rateLimitWindows', v_limits,
                            'analyticsSalts', v_salts, 'activity', v_activity);
end $$;
revoke all on function public.run_retention() from public, anon, authenticated;
grant execute on function public.run_retention() to service_role;

revoke all on all functions in schema private from public, anon;

-- Trends: this period against the one before it, for the operational pages.
-- Each section is included only if the caller holds its permission (sales and
-- fulfilment: orders.read; customers and messages: customers.read). Days are
-- the store's local days. "Paid" means the same as in analytics_summary.
create or replace function private.business_trends(p_tenant uuid, p_days int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_days int := least(greatest(coalesce(p_days, 30), 7), 90);
  v_today date;
  v_from date; v_prev date;
  v_start timestamptz; v_mid timestamptz; v_end timestamptz;
  v_orders boolean := private.has_permission(p_tenant, 'orders.read');
  v_customers boolean := private.has_permission(p_tenant, 'customers.read');
  v_sales jsonb; v_fulfil jsonb; v_cust jsonb; v_msgs jsonb;
begin
  if not (v_orders or v_customers) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select timezone into v_tz from public.tenants where id = p_tenant;
  v_today := (now() at time zone v_tz)::date;
  v_from := v_today - (v_days - 1);
  v_prev := v_from - v_days;
  v_start := v_prev::timestamp at time zone v_tz;
  v_mid := v_from::timestamp at time zone v_tz;
  v_end := (v_today + 1)::timestamp at time zone v_tz;

  if v_orders then
    with o as (
      select (created_at at time zone v_tz)::date as day, created_at >= v_mid as cur, total, status,
             payment_status in ('paid', 'partially_refunded', 'refunded') as is_paid
        from public.orders where tenant_id = p_tenant and created_at >= v_start and created_at < v_end
    ),
    days as (select generate_series(v_from, v_today, interval '1 day')::date as day)
    select jsonb_build_object(
      'placed', jsonb_build_array((select count(*) from o where cur), (select count(*) from o where not cur)),
      'paid', jsonb_build_array((select count(*) from o where cur and is_paid), (select count(*) from o where not cur and is_paid)),
      'revenue', jsonb_build_array((select coalesce(sum(total), 0) from o where cur and is_paid),
                                   (select coalesce(sum(total), 0) from o where not cur and is_paid)),
      'averageOrder', jsonb_build_array((select coalesce(round(avg(total), 2), 0) from o where cur and is_paid),
                                        (select coalesce(round(avg(total), 2), 0) from o where not cur and is_paid)),
      'cancelled', jsonb_build_array((select count(*) from o where cur and status = 'cancelled'),
                                     (select count(*) from o where not cur and status = 'cancelled')),
      'daily', (select jsonb_agg(jsonb_build_object('day', d.day,
                  'orders', (select count(*) from o where o.day = d.day),
                  'revenue', (select coalesce(sum(total), 0) from o where o.day = d.day and o.is_paid)) order by d.day) from days d)
    ) into v_sales;

    -- Fulfilment speed: hours from payment to shipping, for orders shipped in the period.
    with shipped as (
      select e.occurred_at, e.occurred_at >= v_mid as cur,
             extract(epoch from e.occurred_at - (
               select min(p.occurred_at) from public.order_events p
                where p.tenant_id = e.tenant_id and p.order_id = e.order_id
                  and p.event_type = 'payment_status_changed' and p.to_value = 'paid')) / 3600 as hours
        from public.order_events e
       where e.tenant_id = p_tenant and e.event_type = 'status_changed' and e.to_value = 'shipped'
         and e.occurred_at >= v_start and e.occurred_at < v_end
    ),
    days as (select generate_series(v_from, v_today, interval '1 day')::date as day)
    select jsonb_build_object(
      'shipped', jsonb_build_array((select count(*) from shipped where cur), (select count(*) from shipped where not cur)),
      'hoursToShip', jsonb_build_array((select round(avg(hours)::numeric, 1) from shipped where cur and hours >= 0),
                                       (select round(avg(hours)::numeric, 1) from shipped where not cur and hours >= 0)),
      'toFulfilNow', (select count(*) from public.orders where tenant_id = p_tenant and status in ('confirmed', 'processing')),
      'daily', (select jsonb_agg(jsonb_build_object('day', d.day,
                  'shipped', (select count(*) from shipped s where (s.occurred_at at time zone v_tz)::date = d.day)) order by d.day) from days d)
    ) into v_fulfil;
  end if;

  if v_customers then
    -- A customer is an email address; "new" means their first order fell in the period.
    with c as (
      select lower(email) as email, min(created_at) as first_at,
             bool_or(created_at >= v_mid and created_at < v_end) as active_cur,
             bool_or(created_at >= v_start and created_at < v_mid) as active_prev
        from public.orders where tenant_id = p_tenant and created_at < v_end group by lower(email)
    ),
    days as (select generate_series(v_from, v_today, interval '1 day')::date as day)
    select jsonb_build_object(
      'new', jsonb_build_array((select count(*) from c where first_at >= v_mid),
                               (select count(*) from c where first_at >= v_start and first_at < v_mid)),
      'returning', jsonb_build_array((select count(*) from c where active_cur and first_at < v_mid),
                                     (select count(*) from c where active_prev and first_at < v_start)),
      'total', (select count(*) from c),
      'subscribers', jsonb_build_array(
        (select count(*) from public.newsletter_subscribers where tenant_id = p_tenant and subscribed_at >= v_mid and subscribed_at < v_end),
        (select count(*) from public.newsletter_subscribers where tenant_id = p_tenant and subscribed_at >= v_start and subscribed_at < v_mid)),
      'daily', (select jsonb_agg(jsonb_build_object('day', d.day,
                  'new', (select count(*) from c where (c.first_at at time zone v_tz)::date = d.day)) order by d.day) from days d)
    ) into v_cust;

    with m as (
      select created_at, handled_at, created_at >= v_mid as cur
        from public.contact_messages where tenant_id = p_tenant and created_at >= v_start and created_at < v_end
    ),
    h as (
      select handled_at >= v_mid as cur, extract(epoch from handled_at - created_at) / 3600 as hours
        from public.contact_messages
       where tenant_id = p_tenant and handled_at >= v_start and handled_at < v_end
    ),
    days as (select generate_series(v_from, v_today, interval '1 day')::date as day)
    select jsonb_build_object(
      'received', jsonb_build_array((select count(*) from m where cur), (select count(*) from m where not cur)),
      'handled', jsonb_build_array((select count(*) from h where cur), (select count(*) from h where not cur)),
      'hoursToHandle', jsonb_build_array((select round(avg(hours)::numeric, 1) from h where cur),
                                         (select round(avg(hours)::numeric, 1) from h where not cur)),
      'openNow', (select count(*) from public.contact_messages where tenant_id = p_tenant and status = 'open'),
      'daily', (select jsonb_agg(jsonb_build_object('day', d.day,
                  'received', (select count(*) from m where (m.created_at at time zone v_tz)::date = d.day)) order by d.day) from days d)
    ) into v_msgs;
  end if;

  return jsonb_build_object('days', v_days, 'from', v_from, 'to', v_today, 'timezone', v_tz,
    'sales', v_sales, 'fulfilment', v_fulfil, 'customers', v_cust, 'messages', v_msgs);
end $$;

create or replace function public.business_trends(p_tenant uuid, p_days int default 30) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.business_trends(p_tenant, p_days)
$$;
revoke all on function private.business_trends(uuid, int), public.business_trends(uuid, int) from public, anon;
grant execute on function private.business_trends(uuid, int), public.business_trends(uuid, int) to authenticated;

-- Live updates: Supabase Realtime streams inserts to signed-in staff, and
-- applies the RLS policy above to each subscriber. (Guarded so the migration
-- also runs on plain Postgres, e.g. in tests.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.activity_feed;
  end if;
end $$;

commit;
