-- True funnel: every visitor is placed at the furthest step they reached
-- that day, and order placement and verified payment are tracked steps, so
-- the whole funnel is one population and can only narrow step by step.
--
-- Fixes (18 Oct 2026): the old funnel mixed tracked visitors with all orders
-- (orders from untracked visitors could exceed "started checkout"), and quick
-- add from the shop grid could make "added to cart" exceed "viewed a product".
-- The response keeps the previous keys, so the deployed admin keeps working.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.analytics_events drop constraint analytics_events_event_type_check;
alter table public.analytics_events add constraint analytics_events_event_type_check check (event_type in
  ('page_view', 'product_view', 'add_to_cart', 'checkout_started', 'order_placed', 'payment_completed'));

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
  stages as ( -- furthest funnel step each visitor reached that day
    select day, visitor_day, max(case event_type
             when 'page_view' then 1 when 'product_view' then 2 when 'add_to_cart' then 3
             when 'checkout_started' then 4 when 'order_placed' then 5 when 'payment_completed' then 6
           end) as stage
      from ev group by day, visitor_day
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
      -- Each step counts visitors who reached it OR any later step, so the
      -- funnel can only narrow (a quick add from the shop grid counts as having
      -- looked at a product). Same population throughout: tracked visitors.
      'productViewers', (select count(*) from stages where stage >= 2),
      'addedToCart', (select count(*) from stages where stage >= 3),
      'startedCheckout', (select count(*) from stages where stage >= 4),
      'placedOrder', (select count(*) from stages where stage >= 5),
      'paidVisitors', (select count(*) from stages where stage >= 6),
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
    'trackingSince', (select min(occurred_at) from public.analytics_events where tenant_id = p_tenant),
    'lastEventAt', (select max(occurred_at) from public.analytics_events where tenant_id = p_tenant)
  ) into v_result;
  return v_result;
end $$;

revoke all on function private.analytics_summary(uuid, date, date) from public, anon;
grant execute on function private.analytics_summary(uuid, date, date) to authenticated, service_role;

commit;
