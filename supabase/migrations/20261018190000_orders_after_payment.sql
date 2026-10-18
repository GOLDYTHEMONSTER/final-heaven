-- Orders exist only once Flutterwave has confirmed payment.
--
-- Checkout now creates a `checkouts` row: the priced cart, the delivery details
-- and the payment it is waiting for. Nothing is shown to the customer or to
-- staff as an order until apply_verified_payment() verifies a successful
-- payment; it then places the order in the same transaction (order number,
-- tracking number, timeline, stock, promo use, staff alert, receipt).
--
-- Also:
--  - stock (or pre-order allowance) is taken when an order is paid, never
--    before, and given back if a paid order is cancelled; a shortfall is
--    recorded on the order and flagged to staff;
--  - promo codes, applied and counted by the server only;
--  - pre-orders per product;
--  - a sale price must be below the original price.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ----------------------------------------------------------------------------
-- 1. Products: pre-orders and sale-price sanity
-- ----------------------------------------------------------------------------
alter table public.products
  add column preorder boolean not null default false,
  add column preorder_ships_on date,
  add column preorder_limit integer not null default 0 check (preorder_limit >= 0);
alter table public.products add constraint products_preorder_date_check
  check (not preorder or preorder_ships_on is not null);

-- An "original price" at or below the selling price isn't a sale (a live row
-- had ₦40 against ₦15,000); clear those, then keep it that way.
update public.products set original_price = null where original_price is not null and original_price <= price;
alter table public.products add constraint products_sale_price_check
  check (original_price is null or original_price > price);

-- ----------------------------------------------------------------------------
-- 2. Promo codes
-- ----------------------------------------------------------------------------
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description text check (description is null or length(description) <= 200),
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(10,2) not null check (value > 0),
  min_subtotal numeric(10,2) not null default 0 check (min_subtotal >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  once_per_customer boolean not null default true,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  check (kind <> 'percent' or value <= 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create trigger promo_codes_touch before update on public.promo_codes for each row execute function private.touch_updated_at();

alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;
grant select, insert, update on public.promo_codes to authenticated;
grant all on public.promo_codes to service_role;
create policy "Product readers see promo codes" on public.promo_codes
  for select to authenticated using (tenant_id in (select private.permitted_tenants('products.read')));
create policy "Product writers create promo codes" on public.promo_codes
  for insert to authenticated with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers edit promo codes" on public.promo_codes
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')))
  with check (tenant_id in (select private.permitted_tenants('products.write')));

-- ----------------------------------------------------------------------------
-- 3. Checkouts (before payment) and the order columns they carry over
-- ----------------------------------------------------------------------------
create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  store_id uuid not null,
  reference text not null unique check (reference ~ '^[A-Z0-9-]{8,40}$'),
  -- Assigned now, used only when the order is placed; never shown before.
  order_number text not null unique,
  tracking_number text not null unique,
  email text not null check (length(email) between 3 and 254),
  shipping_address text not null,
  shipping_city text,
  shipping_state text,
  shipping_postal_code text,
  shipping_country text,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  subtotal numeric(10,2) not null check (subtotal > 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  total numeric(10,2) not null check (total > 0),
  promo_code_id uuid references public.promo_codes (id) on delete restrict,
  promo_code text,
  is_preorder boolean not null default false,
  terms_version text,
  terms_accepted_at timestamptz,
  status text not null default 'open' check (status in ('open', 'completed', 'expired')),
  order_id uuid unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id),
  check (total = subtotal - discount)
);
create index checkouts_open_idx on public.checkouts (created_at) where status = 'open';
alter table public.checkouts enable row level security;
revoke all on public.checkouts from anon, authenticated;
grant all on public.checkouts to service_role;

alter table public.orders
  add column checkout_id uuid unique references public.checkouts (id) on delete restrict,
  add column discount numeric(10,2) not null default 0 check (discount >= 0),
  add column promo_code_id uuid references public.promo_codes (id) on delete restrict,
  add column promo_code text,
  add column is_preorder boolean not null default false,
  add column stock_committed_at timestamptz,
  add column stock_taken jsonb,
  add column stock_shortfall jsonb,
  add column stock_restored_at timestamptz;
alter table public.checkouts add constraint checkouts_order_fk foreign key (order_id) references public.orders (id) on delete restrict;
create index orders_promo_idx on public.orders (promo_code_id) where promo_code_id is not null;

-- A payment belongs to a checkout until it places the order (then both are set),
-- or directly to an order (legacy orders, manual payments).
alter table public.payments alter column order_id drop not null,
  add column checkout_id uuid references public.checkouts (id) on delete restrict,
  add constraint payments_target_check check (order_id is not null or checkout_id is not null);
create index payments_checkout_idx on public.payments (checkout_id, created_at desc) where checkout_id is not null;

-- ----------------------------------------------------------------------------
-- 4. Stock: taken when an order is paid, given back if a paid order is cancelled
-- ----------------------------------------------------------------------------
create or replace function private.order_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_qty int;
  v_pre boolean;
  v_have int;
  v_take int;
  v_name text;
  v_taken jsonb := '[]';
  v_short jsonb := '[]';
begin
  -- Paid: take each line from stock, or from the pre-order allowance.
  if new.payment_status = 'paid' and old.payment_status not in ('paid', 'partially_refunded', 'refunded')
     and new.stock_committed_at is null and new.status <> 'cancelled' then
    for v_item in select value from jsonb_array_elements(coalesce(new.order_items, '[]'::jsonb)) loop
      v_qty := greatest(coalesce((v_item ->> 'quantity')::int, 0), 0);
      v_pre := coalesce((v_item ->> 'preorder')::boolean, false);
      select case when v_pre then preorder_limit else stock end, name into v_have, v_name
        from public.products where id = v_item ->> 'id' and tenant_id = new.tenant_id for update;
      v_have := coalesce(v_have, 0);
      v_take := least(v_have, v_qty);
      if v_pre then
        update public.products set preorder_limit = preorder_limit - v_take, sales = coalesce(sales, 0) + v_qty
         where id = v_item ->> 'id' and tenant_id = new.tenant_id;
      else
        update public.products set stock = stock - v_take, sales = coalesce(sales, 0) + v_qty
         where id = v_item ->> 'id' and tenant_id = new.tenant_id;
      end if;
      v_taken := v_taken || jsonb_build_object('id', v_item ->> 'id', 'preorder', v_pre, 'quantity', v_take);
      if v_take < v_qty then
        v_short := v_short || jsonb_build_object('id', v_item ->> 'id', 'name', coalesce(v_name, v_item ->> 'name'),
          'size', v_item ->> 'size', 'ordered', v_qty, 'missing', v_qty - v_take);
      end if;
    end loop;
    new.stock_committed_at := now();
    new.stock_taken := v_taken;
    new.stock_shortfall := case when jsonb_array_length(v_short) > 0 then v_short end;
    if new.stock_shortfall is not null then
      perform private.audit(new.tenant_id, 'order.stock_short', 'order', new.order_number, jsonb_build_object('lines', v_short));
    end if;
  end if;

  -- Cancelled after stock was taken: put back exactly what was taken.
  if new.status = 'cancelled' and old.status <> 'cancelled'
     and new.stock_committed_at is not null and new.stock_restored_at is null then
    for v_item in select value from jsonb_array_elements(coalesce(new.stock_taken, '[]'::jsonb)) loop
      if coalesce((v_item ->> 'preorder')::boolean, false) then
        update public.products set preorder_limit = preorder_limit + (v_item ->> 'quantity')::int
         where id = v_item ->> 'id' and tenant_id = new.tenant_id;
      else
        update public.products set stock = stock + (v_item ->> 'quantity')::int
         where id = v_item ->> 'id' and tenant_id = new.tenant_id;
      end if;
    end loop;
    new.stock_restored_at := now();
  end if;
  return new;
end $$;
create trigger orders_stock before update of payment_status, status on public.orders
  for each row execute function private.order_stock();

-- ----------------------------------------------------------------------------
-- 5. Payment confirmation places the order
-- ----------------------------------------------------------------------------
create or replace function private.place_order_from_checkout(p_checkout uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_chk public.checkouts;
  v_order public.orders;
  v_now timestamptz := now();
begin
  select * into v_chk from public.checkouts where id = p_checkout for update;
  if v_chk.order_id is not null then
    select * into v_order from public.orders where id = v_chk.order_id;
    return v_order;
  end if;

  insert into public.orders (tenant_id, store_id, checkout_id, order_number, tracking_number, email,
    status, payment_status, currency, shipping_address, shipping_city, shipping_state, shipping_postal_code,
    shipping_country, subtotal, discount, total, order_items, promo_code_id, promo_code, is_preorder,
    terms_version, terms_accepted_at, timeline)
  values (v_chk.tenant_id, v_chk.store_id, v_chk.id, v_chk.order_number, v_chk.tracking_number, v_chk.email,
    'pending_payment', 'unpaid', v_chk.currency, v_chk.shipping_address, v_chk.shipping_city, v_chk.shipping_state,
    v_chk.shipping_postal_code, v_chk.shipping_country, v_chk.subtotal, v_chk.discount, v_chk.total, v_chk.items,
    v_chk.promo_code_id, v_chk.promo_code, v_chk.is_preorder, v_chk.terms_version, v_chk.terms_accepted_at, '[]')
  returning * into v_order;

  -- Paid and confirmed in one step: the triggers record the events, take the
  -- stock, post the staff alert and queue the receipt.
  update public.orders set payment_status = 'paid', status = 'confirmed' where id = v_order.id;
  update public.orders set timeline = jsonb_build_array(jsonb_build_object('status', 'confirmed',
      'date', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD'), 'time', to_char(v_now at time zone 'UTC', 'HH24:MI'),
      'description', case when v_chk.is_preorder then 'Pre-order placed and paid' else 'Order placed and paid' end))
   where id = v_order.id
  returning * into v_order;

  update public.checkouts set status = 'completed', order_id = v_order.id, completed_at = v_now where id = v_chk.id;
  return v_order;
end $$;

create or replace function public.apply_verified_payment(
  p_reference text, p_provider_transaction_id text, p_status text,
  p_amount_minor bigint, p_currency text, p_failure_reason text default null
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_pay public.payments;
  v_order public.orders;
  v_already_placed boolean := false;
begin
  select * into v_pay from public.payments where reference = p_reference for update;
  if not found then return 'unknown_reference'; end if;
  if v_pay.order_id is not null then
    select * into v_order from public.orders where id = v_pay.order_id for update;
  end if;

  if v_pay.status = 'successful' then
    return 'already_applied'; -- terminal; duplicates and out-of-order events change nothing
  end if;

  if p_status = 'successful' then
    if p_currency is distinct from v_pay.currency then
      update public.payments set status = 'pending', provider_transaction_id = coalesce(p_provider_transaction_id, provider_transaction_id),
        failure_reason = format('currency mismatch: expected %s, got %s', v_pay.currency, p_currency) where id = v_pay.id;
      perform private.audit(v_pay.tenant_id, 'payment.verification_rejected', 'payment', v_pay.reference,
        jsonb_build_object('reason', 'currency_mismatch', 'expected', v_pay.currency, 'got', p_currency));
      return 'rejected_currency';
    end if;
    if p_amount_minor is null or p_amount_minor < v_pay.amount_minor then
      update public.payments set status = 'pending', provider_transaction_id = coalesce(p_provider_transaction_id, provider_transaction_id),
        failure_reason = format('underpaid: expected %s, got %s', v_pay.amount_minor, p_amount_minor) where id = v_pay.id;
      perform private.audit(v_pay.tenant_id, 'payment.verification_rejected', 'payment', v_pay.reference,
        jsonb_build_object('reason', 'amount_mismatch', 'expected_minor', v_pay.amount_minor, 'got_minor', p_amount_minor));
      return 'rejected_amount';
    end if;

    update public.payments set status = 'successful', provider_transaction_id = p_provider_transaction_id,
      paid_amount_minor = p_amount_minor, paid_currency = p_currency, failure_reason = null, verified_at = now()
     where id = v_pay.id;

    -- A checkout payment places the order now. If the checkout was already
    -- placed by another payment, this one is a second payment to refund.
    if v_pay.order_id is null then
      v_already_placed := exists (select 1 from public.checkouts where id = v_pay.checkout_id and order_id is not null);
      v_order := private.place_order_from_checkout(v_pay.checkout_id);
      update public.payments set order_id = v_order.id where id = v_pay.id;
      if v_already_placed then
        perform private.audit(v_pay.tenant_id, 'payment.duplicate', 'payment', v_pay.reference,
          jsonb_build_object('order', v_order.order_number, 'amount_minor', p_amount_minor, 'currency', p_currency));
        perform private.post_activity(v_pay.tenant_id, 'payment.received', 'Second payment for ' || v_order.order_number,
          private.money_label(p_amount_minor::numeric / power(10, private.currency_exponent(p_currency))::numeric, p_currency)
            || ' · already paid, refund this one', '/admin/orders?q=' || v_order.order_number, 'payments.read');
        return 'duplicate_payment';
      end if;
    elsif v_order.payment_status not in ('paid', 'partially_refunded', 'refunded') then
      update public.orders set payment_status = 'paid',
        status = case when status = 'pending_payment' then 'confirmed' else status end
       where id = v_order.id;
    end if;
    perform private.audit(v_pay.tenant_id, 'payment.succeeded', 'payment', v_pay.reference,
      jsonb_build_object('order', v_order.order_number, 'amount_minor', p_amount_minor, 'currency', p_currency,
        'overpaid_minor', p_amount_minor - v_pay.amount_minor,
        'order_was_cancelled', v_order.status = 'cancelled'));
    return case when v_order.status = 'cancelled' then 'applied_to_cancelled_order' else 'applied' end;
  end if;

  if p_status in ('failed', 'cancelled') then
    update public.payments set status = p_status, failure_reason = p_failure_reason,
      provider_transaction_id = coalesce(p_provider_transaction_id, provider_transaction_id) where id = v_pay.id;
    if v_order.id is not null and v_order.payment_status in ('unpaid', 'pending') then
      update public.orders set payment_status = 'failed' where id = v_order.id;
    end if;
    perform private.audit(v_pay.tenant_id, 'payment.failed', 'payment', v_pay.reference,
      jsonb_build_object('status', p_status, 'reason', p_failure_reason));
    return 'failed_recorded';
  end if;

  -- Still pending at the provider.
  update public.payments set status = 'pending',
    provider_transaction_id = coalesce(p_provider_transaction_id, provider_transaction_id) where id = v_pay.id;
  if v_order.id is not null and v_order.payment_status in ('unpaid', 'failed') then
    update public.orders set payment_status = 'pending' where id = v_order.id;
  end if;
  return 'pending';
end $$;
revoke all on function public.apply_verified_payment(text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.apply_verified_payment(text, text, text, bigint, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6. Staff activity: an order appears when it is paid, not before
-- ----------------------------------------------------------------------------
create or replace function private.activity_from_orders() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_link text := '/admin/orders?q=' || new.order_number;
  v_amount text := private.money_label(new.total, new.currency);
begin
  if tg_op = 'INSERT' then
    return null; -- orders are inserted at placement and paid in the same transaction
  end if;
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    perform private.post_activity(new.tenant_id, 'order.placed', 'New order ' || new.order_number,
      v_amount || ' paid'
        || case when new.is_preorder then ' · pre-order' else '' end
        || case when new.stock_shortfall is not null then ' · stock short, check before fulfilling'
                when new.status = 'cancelled' then ' · order was cancelled, refund needed'
                else ' · ready to fulfil' end,
      v_link, 'orders.read');
  elsif new.payment_status = 'failed' and old.payment_status is distinct from 'failed' then
    perform private.post_activity(new.tenant_id, 'payment.failed', 'Payment failed for ' || new.order_number,
      v_amount, v_link, 'payments.read');
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform private.post_activity(new.tenant_id, 'order.cancelled', 'Order ' || new.order_number || ' cancelled',
      v_amount || case when new.stock_restored_at is not null then ' · stock returned' else '' end, v_link, 'orders.read');
  end if;
  return null;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Promo code usage (paid orders only), for checkout limits and admin
-- ----------------------------------------------------------------------------
create or replace function private.promo_usage(p_tenant uuid)
returns table (promo_code_id uuid, uses bigint, discount_total numeric)
language sql stable security definer set search_path = '' as $$
  select o.promo_code_id, count(*), coalesce(sum(o.discount), 0)
    from public.orders o
   where o.tenant_id = p_tenant and o.promo_code_id is not null
     and o.payment_status in ('paid', 'partially_refunded', 'refunded')
     and (private.has_permission(p_tenant, 'products.read') or (select auth.jwt() ->> 'role') = 'service_role')
   group by o.promo_code_id
$$;
create or replace function public.promo_usage(p_tenant uuid)
returns table (promo_code_id uuid, uses bigint, discount_total numeric)
language sql stable security invoker set search_path = '' as $$
  select * from private.promo_usage(p_tenant)
$$;
revoke all on function private.promo_usage(uuid), public.promo_usage(uuid) from public, anon;
grant execute on function private.promo_usage(uuid), public.promo_usage(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Retention: unfinished checkouts lose their personal details after 30 days
-- ----------------------------------------------------------------------------
create or replace function public.run_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events int; v_limits int; v_salts int; v_activity int; v_emails int; v_checkouts int;
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
  -- Kept (payments reference them) but stripped of who and where.
  update public.checkouts set status = 'expired', email = 'removed@invalid', shipping_address = 'removed',
         shipping_city = null, shipping_state = null, shipping_postal_code = null
   where order_id is null and created_at < now() - interval '30 days' and email <> 'removed@invalid';
  get diagnostics v_checkouts = row_count;
  return jsonb_build_object('analyticsEvents', v_events, 'rateLimitWindows', v_limits,
                            'analyticsSalts', v_salts, 'activity', v_activity, 'emails', v_emails,
                            'checkoutsAnonymised', v_checkouts);
end $$;
revoke all on function public.run_retention() from public, anon, authenticated;
grant execute on function public.run_retention() to service_role;

revoke all on all functions in schema private from public, anon;
revoke all on function private.order_stock(), private.place_order_from_checkout(uuid) from authenticated;
-- apply_verified_payment runs as the service role and places orders through these.
grant execute on function private.place_order_from_checkout(uuid),
  private.post_activity(uuid, text, text, text, text, text), private.money_label(numeric, text) to service_role;

commit;
