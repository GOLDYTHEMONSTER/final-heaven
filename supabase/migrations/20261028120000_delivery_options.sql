-- Delivery options (lib/delivery.ts): standard, or Express by air for items
-- ordered in from China, at a fee the server works out by weight.
--
--   checkouts, orders   delivery_option, delivery_fee (part of total) and the
--                       delivery_estimate quoted at checkout
--   checkouts           total = subtotal - discount + delivery_fee
--   ledger              a paid order's Express fee is freight recovery (it
--                       pays for the air freight), reversed with the order
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.checkouts
  add column delivery_option text not null default 'standard' check (delivery_option in ('standard', 'express')),
  add column delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  add column delivery_estimate jsonb check (delivery_estimate is null or jsonb_typeof(delivery_estimate) = 'object');
alter table public.orders
  add column delivery_option text not null default 'standard' check (delivery_option in ('standard', 'express')),
  add column delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  add column delivery_estimate jsonb check (delivery_estimate is null or jsonb_typeof(delivery_estimate) = 'object');

-- The checkout total now includes delivery. The old rule was unnamed: find it by what it says.
do $$
declare
  c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.checkouts'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ~ 'total = \(subtotal - discount\)'
  loop
    execute format('alter table public.checkouts drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.checkouts add constraint checkouts_total_with_delivery_check check (total = subtotal - discount + delivery_fee);

-- open_checkout saves the delivery the server priced.
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
    delivery_option, delivery_fee, delivery_estimate)
  values (
    (p ->> 'tenant_id')::uuid, (p ->> 'store_id')::uuid, p ->> 'reference', p ->> 'order_number', p ->> 'tracking_number',
    p ->> 'email', p ->> 'shipping_address', p ->> 'shipping_city', p ->> 'shipping_state', p ->> 'shipping_postal_code',
    p ->> 'shipping_country', p ->> 'currency', p -> 'items', (p ->> 'subtotal')::numeric, (p ->> 'discount')::numeric,
    (p ->> 'total')::numeric, (p ->> 'promo_code_id')::uuid, p ->> 'promo_code', coalesce((p ->> 'is_preorder')::boolean, false),
    p ->> 'terms_version', (p ->> 'terms_accepted_at')::timestamptz, now() + interval '30 minutes',
    case when jsonb_typeof(p -> 'shipping') = 'object' then p -> 'shipping' end,
    coalesce(p ->> 'delivery_option', 'standard'), coalesce((p ->> 'delivery_fee')::numeric, 0),
    case when jsonb_typeof(p -> 'delivery_estimate') = 'object' then p -> 'delivery_estimate' end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.open_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.open_checkout(jsonb) to service_role;

-- An order placed from a checkout carries its delivery over.
create or replace function private.order_delivery_from_checkout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.checkout_id is not null then
    select c.delivery_option, c.delivery_fee, c.delivery_estimate into new.delivery_option, new.delivery_fee, new.delivery_estimate
      from public.checkouts c where c.id = new.checkout_id;
  end if;
  return new;
end $$;
create trigger orders_delivery_from_checkout before insert on public.orders
  for each row execute function private.order_delivery_from_checkout();

-- The order events of 20261027120000, plus: a paid Express fee is freight recovery for the order.
create or replace function private.order_shipping_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.checkout_id is not null then
      insert into public.order_shipping_allocations (order_id, tenant_id, snapshot)
      select new.id, new.tenant_id, c.shipping_allocation from public.checkouts c
       where c.id = new.checkout_id and c.shipping_allocation is not null
      on conflict (order_id) do nothing;
    end if;
    return null;
  end if;
  if new.payment_status = 'paid' and old.payment_status not in ('paid', 'partially_refunded', 'refunded') and new.status <> 'cancelled' then
    perform private.post_order_shipping(new.id);
    if new.delivery_fee > 0 then
      insert into public.shipping_ledger (tenant_id, kind, amount, order_id, reason, memo, idempotency_key)
      values (new.tenant_id, 'freight_recovery', new.delivery_fee, new.id, 'order_paid', initcap(new.delivery_option) || ' delivery', 'order:' || new.id || ':delivery')
      on conflict (tenant_id, idempotency_key) do nothing;
    end if;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform private.reverse_order_shipping(new.id, 'order_cancelled');
  elsif new.payment_status = 'refunded' and old.payment_status <> 'refunded' then
    perform private.reverse_order_shipping(new.id, 'order_refunded');
  end if;
  return null;
end $$;

revoke all on function private.order_delivery_from_checkout(), private.order_shipping_events() from public, anon, authenticated;

commit;
