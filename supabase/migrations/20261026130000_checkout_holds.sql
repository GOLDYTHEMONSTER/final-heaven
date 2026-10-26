-- Checkout holds: the last pieces can't be sold twice.
--
-- Stock is still taken when an order is paid (private.order_stock). Until
-- then, an open checkout holds its lines for 30 minutes: a new checkout can
-- only start if, after everyone else's live holds, enough is left. The check
-- locks the product rows, so two shoppers starting at the same moment are
-- served one after the other and only one gets the last piece. A checkout
-- that completes, expires or runs out of time releases its hold. Resuming a
-- payment renews the hold, again only if the stock is still free.
-- Checkouts are written only by the server (service role), through these.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.checkouts add column hold_until timestamptz;
create index checkouts_holds_idx on public.checkouts (hold_until) where status = 'open' and order_id is null;

-- Units of a product (or of its pre-order allowance) held by live checkouts, except one.
create or replace function private.held_units(p_product text, p_preorder boolean, p_except uuid default null) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((i ->> 'quantity')::int), 0)::int
    from public.checkouts c, jsonb_array_elements(c.items) i
   where c.status = 'open' and c.order_id is null and c.hold_until > now()
     and (p_except is null or c.id <> p_except)
     and i ->> 'id' = p_product
     and coalesce((i ->> 'preorder')::boolean, false) = p_preorder
$$;

-- Locks each product a checkout takes from (in id order, so concurrent checkouts
-- can't deadlock) and checks enough is left after other live holds. Fails with
-- message 'held:<product id>' and the units still free in DETAIL.
create or replace function private.check_holds(p_items jsonb, p_store uuid, p_except uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_have integer;
  v_free integer;
begin
  for r in
    select i ->> 'id' as id, coalesce((i ->> 'preorder')::boolean, false) as pre, sum((i ->> 'quantity')::int)::int as qty
      from jsonb_array_elements(p_items) i
     group by 1, 2
     order by 1, 2
  loop
    select case when r.pre then p.preorder_limit else p.stock end into v_have
      from public.products p where p.id = r.id and p.store_id = p_store
       for update;
    if not found then
      raise exception 'held:%', r.id using detail = '0';
    end if;
    continue when v_have is null; -- stock not tracked
    v_free := v_have - private.held_units(r.id, r.pre, p_except);
    if v_free < r.qty then
      raise exception 'held:%', r.id using detail = greatest(v_free, 0)::text;
    end if;
  end loop;
end $$;

-- Starts a checkout holding its lines, or fails as private.check_holds does.
create or replace function public.open_checkout(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.check_holds(p -> 'items', (p ->> 'store_id')::uuid, null);
  insert into public.checkouts (
    tenant_id, store_id, reference, order_number, tracking_number, email, shipping_address, shipping_city,
    shipping_state, shipping_postal_code, shipping_country, currency, items, subtotal, discount, total,
    promo_code_id, promo_code, is_preorder, terms_version, terms_accepted_at, hold_until)
  values (
    (p ->> 'tenant_id')::uuid, (p ->> 'store_id')::uuid, p ->> 'reference', p ->> 'order_number', p ->> 'tracking_number',
    p ->> 'email', p ->> 'shipping_address', p ->> 'shipping_city', p ->> 'shipping_state', p ->> 'shipping_postal_code',
    p ->> 'shipping_country', p ->> 'currency', p -> 'items', (p ->> 'subtotal')::numeric, (p ->> 'discount')::numeric,
    (p ->> 'total')::numeric, (p ->> 'promo_code_id')::uuid, p ->> 'promo_code', coalesce((p ->> 'is_preorder')::boolean, false),
    p ->> 'terms_version', (p ->> 'terms_accepted_at')::timestamptz, now() + interval '30 minutes')
  returning id into v_id;
  return v_id;
end $$;

-- Renews an open checkout's hold before its payment is resumed. False when it's
-- no longer open; fails as private.check_holds does when the stock has gone.
create or replace function public.renew_checkout_hold(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v public.checkouts;
begin
  select * into v from public.checkouts where id = p_id for update;
  if not found or v.status <> 'open' or v.order_id is not null then
    return false;
  end if;
  perform private.check_holds(v.items, v.store_id, v.id);
  update public.checkouts set hold_until = now() + interval '30 minutes' where id = p_id;
  return true;
end $$;

-- Live holds on some products, for showing what's really left.
create or replace function public.checkout_holds(p_store uuid, p_products text[]) returns table (product_id text, preorder boolean, quantity integer)
language sql stable security definer set search_path = '' as $$
  select i ->> 'id', coalesce((i ->> 'preorder')::boolean, false), sum((i ->> 'quantity')::int)::int
    from public.checkouts c, jsonb_array_elements(c.items) i
   where c.store_id = p_store and c.status = 'open' and c.order_id is null and c.hold_until > now()
     and i ->> 'id' = any (p_products)
   group by 1, 2
$$;

revoke all on function private.held_units(text, boolean, uuid), private.check_holds(jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.open_checkout(jsonb), public.renew_checkout_hold(uuid), public.checkout_holds(uuid, text[]) from public, anon, authenticated;
grant execute on function public.open_checkout(jsonb), public.renew_checkout_hold(uuid), public.checkout_holds(uuid, text[]) to service_role;

commit;
