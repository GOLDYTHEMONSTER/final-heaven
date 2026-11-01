-- Ad attribution and audience exports (docs/erp/07-reachout.md, "Ads (Meta)").
-- Additive; nothing is sent to anyone.
--
--   analytics_events   utm_content, utm_term and fbclid beside the other tags; the
--                      tag columns allow 200 characters (they were 100)
--   checkouts, orders  attribution: the first and last touch (six tags each),
--                      copied from the Checkout to the order when it is placed
--   open_checkout      saves the attribution (an optional key: older callers work)
--   ads_report         orders, revenue and visitors by campaign / ad set / ad
--   audience_emails    the email lists behind the Meta audience exports
--
-- Attribution is a label. The database keeps only the six known tags, each cut to
-- 200 characters, whatever the server sent. It never feeds a price or a total.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ----------------------------------------------------------------------------
-- 1. Visits: more tags, longer values
-- ----------------------------------------------------------------------------
alter table public.analytics_events
  drop constraint analytics_events_utm_source_check,
  drop constraint analytics_events_utm_medium_check,
  drop constraint analytics_events_utm_campaign_check,
  add column utm_content text,
  add column utm_term text,
  add column fbclid text,
  add constraint analytics_events_utm_source_check check (utm_source is null or length(utm_source) <= 200),
  add constraint analytics_events_utm_medium_check check (utm_medium is null or length(utm_medium) <= 200),
  add constraint analytics_events_utm_campaign_check check (utm_campaign is null or length(utm_campaign) <= 200),
  add constraint analytics_events_utm_content_check check (utm_content is null or length(utm_content) <= 200),
  add constraint analytics_events_utm_term_check check (utm_term is null or length(utm_term) <= 200),
  add constraint analytics_events_fbclid_check check (fbclid is null or length(fbclid) <= 200);

-- The old signature is dropped: with the new defaulted tags, keeping both would make a call ambiguous.
drop function public.track_event(uuid, text, text, text, text, text, text, text, text, text, text);
create function public.track_event(
  p_store uuid, p_event text, p_visitor_seed text, p_path text, p_product text,
  p_referrer_host text, p_utm_source text, p_utm_medium text, p_utm_campaign text,
  p_device text, p_country text,
  p_utm_content text default null, p_utm_term text default null, p_fbclid text default null
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
    referrer_host, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, device, country)
  values (v_tenant, p_store, p_event,
    encode(sha256(v_salt || convert_to(coalesce(p_visitor_seed, ''), 'UTF8')), 'hex'),
    left(p_path, 300), p_product, left(p_referrer_host, 200), left(p_utm_source, 200), left(p_utm_medium, 200),
    left(p_utm_campaign, 200), left(p_utm_content, 200), left(p_utm_term, 200), left(p_fbclid, 200), p_device, upper(p_country));
end $$;
revoke all on function public.track_event(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.track_event(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 2. Attribution on the Checkout and the order
-- ----------------------------------------------------------------------------
-- One landing's tags: the six known keys, each cut to 200 characters; null when none is left.
create or replace function private.clean_touch(t jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'utm_source', nullif(left(t ->> 'utm_source', 200), ''), 'utm_medium', nullif(left(t ->> 'utm_medium', 200), ''),
    'utm_campaign', nullif(left(t ->> 'utm_campaign', 200), ''), 'utm_content', nullif(left(t ->> 'utm_content', 200), ''),
    'utm_term', nullif(left(t ->> 'utm_term', 200), ''), 'fbclid', nullif(left(t ->> 'fbclid', 200), ''))), '{}')
$$;

create or replace function private.clean_attribution(a jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(a) = 'object'
    then nullif(jsonb_strip_nulls(jsonb_build_object(
      'first', private.clean_touch(case when jsonb_typeof(a -> 'first') = 'object' then a -> 'first' end),
      'last', private.clean_touch(case when jsonb_typeof(a -> 'last') = 'object' then a -> 'last' end))), '{}')
  end
$$;

alter table public.checkouts
  add column attribution jsonb check (attribution is null or (jsonb_typeof(attribution) = 'object' and length(attribution::text) <= 1500));
alter table public.orders
  add column attribution jsonb check (attribution is null or (jsonb_typeof(attribution) = 'object' and length(attribution::text) <= 1500));

-- open_checkout of 20261028120000, plus the attribution (an optional key).
create or replace function public.open_checkout(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.check_holds(p -> 'items', (p ->> 'store_id')::uuid, null);
  insert into public.checkouts (
    tenant_id, store_id, reference, order_number, tracking_number, email, shipping_address, shipping_city,
    shipping_state, shipping_postal_code, shipping_country, currency, items, subtotal, discount, total,
    promo_code_id, promo_code, is_preorder, terms_version, terms_accepted_at, hold_until, shipping_allocation,
    delivery_option, delivery_fee, delivery_estimate, attribution)
  values (
    (p ->> 'tenant_id')::uuid, (p ->> 'store_id')::uuid, p ->> 'reference', p ->> 'order_number', p ->> 'tracking_number',
    p ->> 'email', p ->> 'shipping_address', p ->> 'shipping_city', p ->> 'shipping_state', p ->> 'shipping_postal_code',
    p ->> 'shipping_country', p ->> 'currency', p -> 'items', (p ->> 'subtotal')::numeric, (p ->> 'discount')::numeric,
    (p ->> 'total')::numeric, (p ->> 'promo_code_id')::uuid, p ->> 'promo_code', coalesce((p ->> 'is_preorder')::boolean, false),
    p ->> 'terms_version', (p ->> 'terms_accepted_at')::timestamptz, now() + interval '30 minutes',
    case when jsonb_typeof(p -> 'shipping') = 'object' then p -> 'shipping' end,
    coalesce(p ->> 'delivery_option', 'standard'), coalesce((p ->> 'delivery_fee')::numeric, 0),
    case when jsonb_typeof(p -> 'delivery_estimate') = 'object' then p -> 'delivery_estimate' end,
    private.clean_attribution(p -> 'attribution'))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.open_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.open_checkout(jsonb) to service_role;

-- An order placed from a checkout carries its attribution over.
create or replace function private.order_attribution_from_checkout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.checkout_id is not null then
    select c.attribution into new.attribution from public.checkouts c where c.id = new.checkout_id;
  end if;
  return new;
end $$;
create trigger orders_attribution_from_checkout before insert on public.orders
  for each row execute function private.order_attribution_from_checkout();
revoke all on function private.order_attribution_from_checkout(), private.clean_touch(jsonb), private.clean_attribution(jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Ads report (needs analytics.read): paid orders by the touch p_touch ('first' or 'last')
-- ----------------------------------------------------------------------------
-- Orders that carry a campaign tag or a Meta click ID, grouped by campaign, ad
-- set (utm_content) and ad (utm_term), with the visitors who landed with the
-- same tags. Revenue is the order total, like gross sales (before refunds), for
-- orders placed in the range. Returns totals and rows only, never an order or a person.
create or replace function private.ads_report(p_tenant uuid, p_from date, p_to date, p_touch text default 'last') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_out jsonb;
begin
  if not private.has_permission(p_tenant, 'analytics.read') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 or p_touch not in ('first', 'last') then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  select timezone into v_tz from public.tenants where id = p_tenant;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  with
  paid as (
    select o.total, o.attribution -> p_touch as t
      from public.orders o
     where o.tenant_id = p_tenant and o.created_at >= v_start and o.created_at < v_end
       and o.payment_status in ('paid', 'partially_refunded', 'refunded')
  ),
  tagged as (
    select coalesce(t ->> 'utm_campaign', '(no campaign)') as campaign, coalesce(t ->> 'utm_content', '(not set)') as adset,
           coalesce(t ->> 'utm_term', '(not set)') as ad, total
      from paid where t ->> 'utm_campaign' is not null or t ->> 'fbclid' is not null
  ),
  landed as ( -- one row per visitor per day per set of tags, from the visit tags
    select distinct (e.occurred_at at time zone v_tz)::date as day, e.visitor_day,
           coalesce(e.utm_campaign, '(no campaign)') as campaign, coalesce(e.utm_content, '(not set)') as adset,
           coalesce(e.utm_term, '(not set)') as ad
      from public.analytics_events e
     where e.tenant_id = p_tenant and e.occurred_at >= v_start and e.occurred_at < v_end
       and (e.utm_campaign is not null or e.fbclid is not null)
  ),
  x as (
    select 'order' as kind, campaign, adset, ad, null::text as visit, total from tagged
    union all
    select 'visit', campaign, adset, ad, day::text || visitor_day, 0 from landed
  ),
  g as (
    select campaign, adset, ad,
           (case when grouping(adset) = 1 then 'campaign' when grouping(ad) = 1 then 'adset' else 'ad' end) as level,
           count(distinct visit) as visitors,
           count(*) filter (where kind = 'order') as orders,
           coalesce(sum(total) filter (where kind = 'order'), 0) as revenue
      from x group by grouping sets ((campaign), (campaign, adset), (campaign, adset, ad))
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', v_tz),
    'touch', p_touch,
    'currency', (select coalesce(max(currency), 'NGN') from public.orders where tenant_id = p_tenant),
    'totals', jsonb_build_object(
      'paidOrders', (select count(*) from paid),
      'paidRevenue', (select coalesce(sum(total), 0) from paid),
      'adOrders', (select count(*) from tagged),
      'adRevenue', (select coalesce(sum(total), 0) from tagged),
      'adVisitors', (select count(distinct day::text || visitor_day) from landed)),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('campaign', campaign, 'visitors', visitors, 'orders', orders, 'revenue', revenue)
                                           order by revenue desc, visitors desc, campaign) from g where level = 'campaign'), '[]'),
    'adSets', coalesce((select jsonb_agg(jsonb_build_object('campaign', campaign, 'adSet', adset, 'visitors', visitors, 'orders', orders, 'revenue', revenue)
                                           order by revenue desc, visitors desc, campaign, adset) from g where level = 'adset'), '[]'),
    'ads', coalesce((select jsonb_agg(jsonb_build_object('campaign', campaign, 'adSet', adset, 'ad', ad, 'visitors', visitors, 'orders', orders, 'revenue', revenue)
                                        order by revenue desc, visitors desc, campaign, adset, ad) from g where level = 'ad'), '[]')
  ) into v_out;
  return v_out;
end $$;

create or replace function public.ads_report(p_tenant uuid, p_from date, p_to date, p_touch text default 'last') returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.ads_report(p_tenant, p_from, p_to, p_touch) $$;
revoke all on function public.ads_report(uuid, date, date, text) from public, anon;
grant execute on function public.ads_report(uuid, date, date, text) to authenticated;
revoke all on function private.ads_report(uuid, date, date, text) from public, anon;
grant execute on function private.ads_report(uuid, date, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Audience lists (needs customers.read): the addresses behind the Meta exports
-- ----------------------------------------------------------------------------
--   purchasers   a paid order in the last p_days days (refunded orders don't count)
--   subscribers  consented, still subscribed, not suppressed, and no paid order ever
-- The server hashes the addresses and writes the audit entry; this only lists them.
create or replace function private.audience_emails(p_tenant uuid, p_kind text, p_days integer default 180) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission(p_tenant, 'customers.read') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_kind not in ('purchasers', 'subscribers') or p_days not between 1 and 730 then
    raise exception 'invalid audience' using errcode = '22023';
  end if;
  if p_kind = 'purchasers' then
    return query select distinct lower(btrim(o.email)) from public.orders o
      where o.tenant_id = p_tenant and o.payment_status in ('paid', 'partially_refunded')
        and o.created_at >= now() - make_interval(days => p_days) order by 1;
  else
    return query select distinct lower(btrim(s.email)) from public.newsletter_subscribers s
      where s.tenant_id = p_tenant and s.consented_at is not null and s.unsubscribed_at is null
        and not exists (select 1 from public.email_suppressions x where x.tenant_id = p_tenant and x.email = lower(btrim(s.email)))
        and not exists (select 1 from public.orders o where o.tenant_id = p_tenant and lower(btrim(o.email)) = lower(btrim(s.email))
                          and o.payment_status in ('paid', 'partially_refunded', 'refunded')) order by 1;
  end if;
end $$;

create or replace function public.audience_emails(p_tenant uuid, p_kind text, p_days integer default 180) returns setof text
language sql stable security invoker set search_path = '' as $$ select * from private.audience_emails(p_tenant, p_kind, p_days) $$;
revoke all on function public.audience_emails(uuid, text, integer) from public, anon;
grant execute on function public.audience_emails(uuid, text, integer) to authenticated;
revoke all on function private.audience_emails(uuid, text, integer) from public, anon;
grant execute on function private.audience_emails(uuid, text, integer) to authenticated;

commit;
