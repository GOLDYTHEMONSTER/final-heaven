-- Analytics, customer summaries, compliance fields, retention.
--
-- Analytics are privacy-first: no cookies and nothing stored in the browser.
-- A visitor is counted per day as sha256(daily salt || ip || user agent);
-- salts are random, rotate daily and are deleted after a day, so a visitor
-- can't be recognised across days or re-identified from the hash.
-- KPI definitions: docs/erp/02-analytics-and-compliance.md
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ----------------------------------------------------------------------------
-- 1. Store settings: time zone for reporting days, hidden categories
-- ----------------------------------------------------------------------------
alter table public.tenants add column timezone text not null default 'Africa/Lagos';
alter table public.stores add column hidden_categories text[] not null default '{}';

-- Vapes are hidden pending legal review (decision 18 Oct 2026). Reversible:
--   update public.stores set hidden_categories = '{}' where slug = 'final-heaven';
update public.stores set hidden_categories = array['Vapes'] where slug = 'final-heaven';

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active, unhidden products" on public.products
  for select to anon, authenticated
  using (
    status = 'active'
    and not exists (
      select 1 from public.stores s
       where s.id = products.store_id and products.category = any (s.hidden_categories))
  );

-- ----------------------------------------------------------------------------
-- 2. Orders: terms acceptance, courier shipment reference
-- ----------------------------------------------------------------------------
alter table public.orders
  add column terms_version text,
  add column terms_accepted_at timestamptz,
  add column shipping_carrier text check (shipping_carrier is null or length(shipping_carrier) <= 80),
  add column shipping_reference text check (shipping_reference is null or length(shipping_reference) <= 120);

-- Staff may record the courier and reference (orders.update via RLS).
grant update (shipping_carrier, shipping_reference) on public.orders to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Newsletter consent and unsubscribe
-- ----------------------------------------------------------------------------
alter table public.newsletter_subscribers
  add column consent_text text,
  add column consented_at timestamptz,
  add column unsubscribed_at timestamptz,
  add column unsubscribe_token uuid not null default gen_random_uuid() unique;

-- Unsubscribe by token (from an email link). No sign-in needed; reveals nothing.
create or replace function public.newsletter_unsubscribe(p_token uuid) returns boolean
language sql security invoker set search_path = '' as $$
  with u as (
    update public.newsletter_subscribers set unsubscribed_at = coalesce(unsubscribed_at, now())
     where unsubscribe_token = p_token returning 1)
  select exists (select 1 from u)
$$;
revoke all on function public.newsletter_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function public.newsletter_unsubscribe(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Analytics events
-- ----------------------------------------------------------------------------
create table public.analytics_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  store_id uuid not null,
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type in ('page_view', 'product_view', 'add_to_cart', 'checkout_started')),
  visitor_day text not null check (visitor_day ~ '^[0-9a-f]{64}$'), -- daily-rotating hash, see header
  path text check (path is null or length(path) <= 300),
  product_id text check (product_id is null or product_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  referrer_host text check (referrer_host is null or length(referrer_host) <= 200),
  utm_source text check (utm_source is null or length(utm_source) <= 100),
  utm_medium text check (utm_medium is null or length(utm_medium) <= 100),
  utm_campaign text check (utm_campaign is null or length(utm_campaign) <= 100),
  device text check (device in ('mobile', 'tablet', 'desktop')),
  country char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id)
);
create index analytics_events_tenant_time_idx on public.analytics_events (tenant_id, occurred_at);

create table private.analytics_salts (
  day date primary key,
  -- 32 random bytes from two v4 UUIDs (core Postgres; no pgcrypto dependency)
  salt bytea not null default decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex')
);

-- Records one event. Called by the server (service role) only. The raw
-- visitor seed (ip + user agent) is hashed here and never stored.
create or replace function public.track_event(
  p_store uuid, p_event text, p_visitor_seed text, p_path text, p_product text,
  p_referrer_host text, p_utm_source text, p_utm_medium text, p_utm_campaign text,
  p_device text, p_country text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_salt bytea;
  v_today date := (now() at time zone 'UTC')::date;
begin
  select tenant_id into v_tenant from public.stores where id = p_store and status = 'active';
  if v_tenant is null then return; end if;

  insert into private.analytics_salts (day) values (v_today) on conflict (day) do nothing;
  select salt into v_salt from private.analytics_salts where day = v_today;

  insert into public.analytics_events (tenant_id, store_id, event_type, visitor_day, path, product_id,
    referrer_host, utm_source, utm_medium, utm_campaign, device, country)
  values (v_tenant, p_store, p_event,
    encode(sha256(v_salt || convert_to(coalesce(p_visitor_seed, ''), 'UTF8')), 'hex'),
    left(p_path, 300), p_product, left(p_referrer_host, 200), left(p_utm_source, 100), left(p_utm_medium, 100),
    left(p_utm_campaign, 100), p_device, upper(p_country));
end $$;
revoke all on function public.track_event(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.track_event(uuid, text, text, text, text, text, text, text, text, text, text) to service_role;

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;
grant select on public.analytics_events to authenticated;
grant all on public.analytics_events to service_role;
create policy "Analytics readers see their tenant's events" on public.analytics_events for select to authenticated
  using (tenant_id in (select private.permitted_tenants('analytics.read')));

-- ----------------------------------------------------------------------------
-- 5. Analytics summary (definitions in docs/erp/02-analytics-and-compliance.md)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so results don't depend on which other read permissions a
-- caller holds; access is checked explicitly (analytics.read in p_tenant) and
-- only aggregates are returned, never individual orders or visitors.
create or replace function private.analytics_summary(p_tenant uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if not private.has_permission(p_tenant, 'analytics.read') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  select timezone into v_tz from public.tenants where id = p_tenant;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  with o as (
    select *, (created_at at time zone v_tz)::date as day,
           payment_status in ('paid', 'partially_refunded', 'refunded') as is_paid
      from public.orders
     where tenant_id = p_tenant and created_at >= v_start and created_at < v_end
  ),
  paid_items as (
    select i ->> 'id' as product_id, i ->> 'name' as name,
           coalesce((i ->> 'quantity')::numeric, 0) as qty,
           coalesce((i ->> 'price')::numeric, 0) * coalesce((i ->> 'quantity')::numeric, 0) as revenue
      from o, jsonb_array_elements(o.order_items) i
     where o.is_paid
  ),
  ev as (
    select *, (occurred_at at time zone v_tz)::date as day
      from public.analytics_events
     where tenant_id = p_tenant and occurred_at >= v_start and occurred_at < v_end
  ),
  visits as ( -- one row per visitor per day, with where they came from
    select distinct on (day, visitor_day) day, visitor_day,
           coalesce(nullif(utm_source, ''), referrer_host, 'Direct') as source, device
      from ev order by day, visitor_day, occurred_at
  ),
  days as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  all_paid as ( -- every verified-paid order ever, for new vs repeat customers
    select lower(email) as email, created_at
      from public.orders
     where tenant_id = p_tenant and payment_status in ('paid', 'partially_refunded', 'refunded')
  ),
  period_customers as (
    select distinct lower(email) as email from o where is_paid
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', v_tz),
    'currency', (select coalesce(max(currency), 'NGN') from o),
    'orders', jsonb_build_object(
      'placed', (select count(*) from o),
      'paid', (select count(*) from o where is_paid),
      'awaitingPayment', (select count(*) from o where status = 'pending_payment'),
      'awaitingPaymentValue', (select coalesce(sum(total), 0) from o where status = 'pending_payment'),
      'cancelled', (select count(*) from o where status = 'cancelled'),
      'unverifiedLegacy', (select count(*) from o where payment_status = 'unverified'),
      'unverifiedLegacyValue', (select coalesce(sum(total), 0) from o where payment_status = 'unverified')
    ),
    'sales', jsonb_build_object(
      'gross', (select coalesce(sum(total), 0) from o where is_paid),
      'averageOrderValue', (select coalesce(round(avg(total), 2), 0) from o where is_paid)
    ),
    'fulfilment', jsonb_build_object( -- current state, not limited to the period
      'toFulfil', (select count(*) from public.orders where tenant_id = p_tenant and status in ('confirmed', 'processing')),
      'inTransit', (select count(*) from public.orders where tenant_id = p_tenant and status = 'shipped'),
      'awaitingPaymentNow', (select count(*) from public.orders where tenant_id = p_tenant and status = 'pending_payment')
    ),
    'customers', jsonb_build_object(
      'paying', (select count(*) from period_customers),
      'new', (select count(*) from period_customers pc
                where (select min(created_at) from all_paid ap where ap.email = pc.email) >= v_start),
      'repeat', (select count(*) from period_customers pc
                   where (select count(*) from all_paid ap where ap.email = pc.email) >= 2)
    ),
    'traffic', jsonb_build_object(
      'visitorDays', (select count(*) from visits),
      'productViewers', (select count(distinct (day, visitor_day)) from ev where event_type = 'product_view'),
      'addedToCart', (select count(distinct (day, visitor_day)) from ev where event_type = 'add_to_cart'),
      'startedCheckout', (select count(distinct (day, visitor_day)) from ev where event_type = 'checkout_started'),
      'pageViews', (select count(*) from ev where event_type = 'page_view')
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'paidOrders', (select count(*) from o where o.day = d.day and o.is_paid),
        'gross', (select coalesce(sum(total), 0) from o where o.day = d.day and o.is_paid),
        'visitors', (select count(*) from visits v where v.day = d.day)
      ) order by d.day), '[]'::jsonb) from days d),
    'topProducts', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]'::jsonb) from (
        select product_id as "productId", max(name) as name, sum(qty) as units, sum(revenue) as revenue
          from paid_items group by product_id order by sum(revenue) desc limit 5) t),
    'sources', (select coalesce(jsonb_agg(t order by t.visitors desc), '[]'::jsonb) from (
        select source, count(*) as visitors from visits group by source order by count(*) desc limit 6) t),
    'devices', (select coalesce(jsonb_agg(t order by t.visitors desc), '[]'::jsonb) from (
        select coalesce(device, 'unknown') as device, count(*) as visitors from visits group by 1) t),
    'trackingSince', (select min(occurred_at) from public.analytics_events where tenant_id = p_tenant)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.analytics_summary(p_tenant uuid, p_from date, p_to date) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.analytics_summary(p_tenant, p_from, p_to) $$;
revoke all on function public.analytics_summary(uuid, date, date) from public, anon;
grant execute on function public.analytics_summary(uuid, date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Customer summaries (one row per customer email, from orders)
-- ----------------------------------------------------------------------------
-- Until Phase 2 adds an authoritative customers table, a customer is the
-- lower-cased email on their orders. No automatic merging beyond that.
create or replace function private.customer_summaries(p_tenant uuid, p_search text, p_limit int, p_offset int)
returns table (email text, orders bigint, paid_orders bigint, paid_total numeric, currency text,
               first_order_at timestamptz, last_order_at timestamptz, last_city text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission(p_tenant, 'customers.read') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return query
  with c as (
    select lower(o.email) as email,
           count(*) as orders,
           count(*) filter (where o.payment_status in ('paid', 'partially_refunded', 'refunded')) as paid_orders,
           coalesce(sum(o.total) filter (where o.payment_status in ('paid', 'partially_refunded', 'refunded')), 0) as paid_total,
           max(o.currency)::text as currency,
           min(o.created_at) as first_order_at,
           max(o.created_at) as last_order_at,
           (array_agg(o.shipping_city order by o.created_at desc))[1] as last_city
      from public.orders o
     where o.tenant_id = p_tenant
       and (p_search is null or p_search = '' or o.email ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%')
     group by lower(o.email)
  )
  select c.*, count(*) over () as total_count
    from c order by c.last_order_at desc
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.customer_summaries(p_tenant uuid, p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (email text, orders bigint, paid_orders bigint, paid_total numeric, currency text,
               first_order_at timestamptz, last_order_at timestamptz, last_city text, total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select * from private.customer_summaries(p_tenant, p_search, p_limit, p_offset)
$$;
revoke all on function public.customer_summaries(uuid, text, int, int) from public, anon;
grant execute on function public.customer_summaries(uuid, text, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Retention (run daily by the server; see docs/erp/02-analytics-and-compliance.md)
-- ----------------------------------------------------------------------------
-- Only operational and analytics data expires here. Orders, payments, payment
-- events, order events and the audit log are financial/accountability records
-- and are never deleted by this job.
create or replace function public.run_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events int; v_limits int; v_salts int;
begin
  delete from public.analytics_events where occurred_at < now() - interval '13 months';
  get diagnostics v_events = row_count;
  delete from private.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_limits = row_count;
  -- Yesterday's salt is kept for late events; anything older is destroyed.
  delete from private.analytics_salts where day < (now() at time zone 'UTC')::date - 1;
  get diagnostics v_salts = row_count;
  return jsonb_build_object('analyticsEvents', v_events, 'rateLimitWindows', v_limits, 'analyticsSalts', v_salts);
end $$;
revoke all on function public.run_retention() from public, anon, authenticated;
grant execute on function public.run_retention() to service_role;

-- Function privileges for everything added to the private schema here.
revoke all on all functions in schema private from public, anon;
grant execute on function private.analytics_summary(uuid, date, date), private.customer_summaries(uuid, text, int, int)
  to authenticated, service_role;
revoke all on private.analytics_salts from public, anon, authenticated;

commit;
