-- Smart Shipping and cost recovery (docs/erp/06-shipping.md).
--
-- The formulas live in one place, lib/shipping/engine.ts. The database holds
-- what staff configure, what each order allocated, and an append-only ledger:
--
--   shipping_settings, shipping_classes   recovery policy and class limits
--   shipping_rates                        forwarder rates, versioned: a rate in
--                                         use is never edited, only replaced
--   product_shipping_profiles             packed weight and size per product
--                                         (or per size), contribution rules,
--                                         staff overrides with a reason
--   clearance_campaigns (+ _products)     clearance pricing and shipping subsidy
--   order_shipping_allocations            what each order allocated, copied from
--                                         its checkout; never recalculated
--   freight_shipments (+ orders, lines,   consolidated air shipments of orders,
--     receipts, invoices, reconciliations) and planned inventory batches (sea)
--   shipping_ledger                       freight recovery, logistics reserve,
--                                         platform revenue, campaign subsidies
--                                         and unfunded freight, append-only
--
-- What a customer pays is unchanged: the shipping contribution is part of the
-- product price. Staff-only throughout (shipping.read / shipping.manage /
-- finance.adjust); nothing here is readable with the public key.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ----------------------------------------------------------------------------
-- 1. Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('shipping.read',   'View shipping rates, product shipping profiles, freight shipments and cost recovery'),
  ('shipping.manage', 'Change shipping rates, product shipping profiles, freight shipments and clearance campaigns'),
  ('finance.adjust',  'Finalise freight reconciliations, adjust the shipping ledger and approve pricing exceptions');

insert into public.role_permissions (role_id, permission_key)
select r.id, x.perm
  from public.roles r
  join (values
    ('owner', 'shipping.read'), ('owner', 'shipping.manage'), ('owner', 'finance.adjust'),
    ('administrator', 'shipping.read'), ('administrator', 'shipping.manage'),
    ('finance_manager', 'shipping.read'), ('finance_manager', 'finance.adjust'),
    ('inventory_manager', 'shipping.read'), ('inventory_manager', 'shipping.manage'),
    ('analyst', 'shipping.read')
  ) as x (role_key, perm) on x.role_key = r.key
 where r.tenant_id is null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2. Policy: settings and shipping classes
-- ----------------------------------------------------------------------------
create table public.shipping_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  recovery_target_pct numeric(5,2) not null default 50 check (recovery_target_pct between 0 and 100),
  reserve_share_pct numeric(5,2) not null default 0 check (reserve_share_pct >= 0 and reserve_share_pct < 95),
  platform_contribution_pct numeric(5,2) not null default 0 check (platform_contribution_pct between 0 and 100),
  max_contribution_pct_of_price numeric(5,2) check (max_contribution_pct_of_price is null or max_contribution_pct_of_price between 0 and 100),
  value_tier_factors jsonb not null default '{"low": 1, "standard": 1, "premium": 1, "luxury": 1}'
    check (jsonb_typeof(value_tier_factors) = 'object'),
  min_margin_pct numeric(5,2) default 0 check (min_margin_pct is null or min_margin_pct between -100 and 100),
  target_margin_pct numeric(5,2) check (target_margin_pct is null or target_margin_pct between 0 and 95),
  payment_fee_pct numeric(5,2) check (payment_fee_pct is null or payment_fee_pct between 0 and 20),
  payment_fee_fixed numeric(12,2) check (payment_fee_fixed is null or payment_fee_fixed >= 0),
  platform_recognised_on text not null default 'delivered' check (platform_recognised_on in ('delivered', 'shipped')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.shipping_classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (length(name) between 1 and 60),
  sort integer not null default 0,
  max_chargeable_kg numeric(10,3) check (max_chargeable_kg is null or max_chargeable_kg > 0),
  min_contribution numeric(12,2) check (min_contribution is null or min_contribution >= 0),
  max_contribution numeric(12,2) check (max_contribution is null or max_contribution >= 0),
  max_contribution_pct_of_price numeric(5,2) check (max_contribution_pct_of_price is null or max_contribution_pct_of_price between 0 and 100),
  adjustment_factor numeric(6,3) not null default 1 check (adjustment_factor > 0 and adjustment_factor <= 10),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key),
  check (min_contribution is null or max_contribution is null or min_contribution <= max_contribution)
);

-- Starting bands by chargeable weight, with no money limits until staff set them.
insert into public.shipping_settings (tenant_id) select id from public.tenants;
insert into public.shipping_classes (tenant_id, key, name, sort, max_chargeable_kg)
select t.id, c.key, c.name, c.sort, c.max_kg
  from public.tenants t
 cross join (values ('ultra_light', 'Ultra-light', 1, 0.05), ('lightweight', 'Lightweight', 2, 0.15),
   ('standard', 'Standard', 3, 1.0), ('heavy', 'Heavy', 4, 5.0), ('bulky', 'Bulky or special handling', 5, null)) as c (key, name, sort, max_kg);

-- ----------------------------------------------------------------------------
-- 3. Rates, versioned
-- ----------------------------------------------------------------------------
create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  method text not null check (method in ('air', 'sea')),
  provider text not null check (length(provider) between 1 and 120),
  origin text check (origin is null or length(origin) <= 120),
  destination text check (destination is null or length(destination) <= 120),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(14,6) check (fx_rate is null or fx_rate > 0),
  billing_unit text not null check (billing_unit in ('kg', 'cbm')),
  rate_per_unit numeric(12,2) not null check (rate_per_unit > 0),
  volumetric_divisor integer check (volumetric_divisor is null or volumetric_divisor between 500 and 20000),
  min_chargeable numeric(10,3) check (min_chargeable is null or min_chargeable > 0),
  rounding_increment numeric(10,3) check (rounding_increment is null or rounding_increment > 0),
  min_shipment_charge numeric(12,2) check (min_shipment_charge is null or min_shipment_charge >= 0),
  surcharge_per_unit numeric(12,2) check (surcharge_per_unit is null or surcharge_per_unit >= 0),
  handling_per_shipment numeric(12,2) check (handling_per_shipment is null or handling_per_shipment >= 0),
  clearance_included boolean not null default false,
  clearance_per_unit numeric(12,2) check (clearance_per_unit is null or clearance_per_unit >= 0),
  insurance_pct numeric(5,2) check (insurance_pct is null or insurance_pct between 0 and 100),
  contingency_pct numeric(5,2) check (contingency_pct is null or contingency_pct between 0 and 100),
  typical_shipment_units numeric(10,3) check (typical_shipment_units is null or typical_shipment_units > 0),
  included_services text check (included_services is null or length(included_services) <= 1000),
  excluded_services text check (excluded_services is null or length(excluded_services) <= 1000),
  notes text check (notes is null or length(notes) <= 2000),
  document_url text check (document_url is null or length(document_url) <= 2000),
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive', 'superseded')),
  superseded_by uuid references public.shipping_rates (id) on delete set null,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (effective_to is null or effective_to >= effective_from),
  check (currency = 'NGN' or fx_rate is not null),
  check (method = 'sea' or billing_unit = 'kg'),
  check (status <> 'active' or confirmed_at is not null)
);
create index shipping_rates_tenant_idx on public.shipping_rates (tenant_id, method, status, effective_from desc);

-- Rates are entered (confirmed) by a member of staff, and their terms never
-- change once saved: a new rate replaces an old one, so every estimate made
-- with it can still be explained. Only the status, end date, notes and link change.
create or replace function private.shipping_rate_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.confirmed_by := coalesce((select auth.uid()), new.confirmed_by);
    new.confirmed_at := coalesce(new.confirmed_at, now());
    return new;
  end if;
  if (new.method, new.provider, new.origin, new.destination, new.currency, new.fx_rate, new.billing_unit, new.rate_per_unit,
      new.volumetric_divisor, new.min_chargeable, new.rounding_increment, new.min_shipment_charge, new.surcharge_per_unit,
      new.handling_per_shipment, new.clearance_included, new.clearance_per_unit, new.insurance_pct, new.contingency_pct,
      new.typical_shipment_units, new.effective_from, new.tenant_id, new.confirmed_by, new.confirmed_at, new.created_at)
     is distinct from
     (old.method, old.provider, old.origin, old.destination, old.currency, old.fx_rate, old.billing_unit, old.rate_per_unit,
      old.volumetric_divisor, old.min_chargeable, old.rounding_increment, old.min_shipment_charge, old.surcharge_per_unit,
      old.handling_per_shipment, old.clearance_included, old.clearance_per_unit, old.insurance_pct, old.contingency_pct,
      old.typical_shipment_units, old.effective_from, old.tenant_id, old.confirmed_by, old.confirmed_at, old.created_at) then
    raise exception 'A saved rate can’t be changed: add a new rate to replace it, so past estimates still add up.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger shipping_rates_rules before insert or update on public.shipping_rates
  for each row execute function private.shipping_rate_rules();

-- ----------------------------------------------------------------------------
-- 4. Product shipping profiles (staff-only: products' own columns are public)
-- ----------------------------------------------------------------------------
create table public.product_shipping_profiles (
  product_id text not null,
  -- '' for the whole product, or the size whose packing differs.
  variant text not null default '' check (length(variant) <= 20),
  tenant_id uuid not null,
  method text not null default 'air' check (method in ('air', 'sea')),
  weight_kg numeric(10,3) check (weight_kg is null or weight_kg > 0),
  length_cm numeric(8,1) check (length_cm is null or length_cm > 0),
  width_cm numeric(8,1) check (width_cm is null or width_cm > 0),
  height_cm numeric(8,1) check (height_cm is null or height_cm > 0),
  packaging_kg numeric(10,3) check (packaging_kg is null or packaging_kg >= 0),
  -- The units staff entered in (values are stored in kg and cm).
  weight_unit text not null default 'g' check (weight_unit in ('g', 'kg')),
  dimension_unit text not null default 'cm' check (dimension_unit in ('cm', 'in')),
  data_status text not null default 'estimated' check (data_status in ('estimated', 'verified')),
  class_key text check (class_key is null or class_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  value_tier text not null default 'standard' check (value_tier in ('low', 'standard', 'premium', 'luxury')),
  target_pct numeric(5,2) check (target_pct is null or target_pct between 0 and 100),
  min_contribution numeric(12,2) check (min_contribution is null or min_contribution >= 0),
  max_contribution numeric(12,2) check (max_contribution is null or max_contribution >= 0),
  adjustment_factor numeric(6,3) not null default 1 check (adjustment_factor > 0 and adjustment_factor <= 10),
  clearance_eligible boolean not null default true,
  subsidy_eligible boolean not null default true,
  platform_contribution numeric(12,2) check (platform_contribution is null or platform_contribution >= 0),
  competitor_price numeric(12,2) check (competitor_price is null or competitor_price > 0),
  override_contribution numeric(12,2) check (override_contribution is null or override_contribution >= 0),
  override_reason text check (override_reason is null or length(override_reason) <= 500),
  override_by uuid,
  override_at timestamptz,
  last_calculated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (product_id, variant),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  check (override_contribution is null or length(trim(coalesce(override_reason, ''))) >= 3),
  check (min_contribution is null or max_contribution is null or min_contribution <= max_contribution)
);
create index product_shipping_profiles_tenant_idx on public.product_shipping_profiles (tenant_id);

-- Who set an override and when come from the session, never the request; every
-- change is in the audit log with the reason.
create or replace function private.shipping_profile_override() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.override_contribution is distinct from old.override_contribution
     or new.override_reason is distinct from old.override_reason then
    if new.override_contribution is null then
      new.override_reason := null; new.override_by := null; new.override_at := null;
    else
      new.override_by := (select auth.uid()); new.override_at := now();
    end if;
    if new.override_contribution is not null or (tg_op = 'UPDATE' and old.override_contribution is not null) then
      perform private.audit(new.tenant_id, case when new.override_contribution is null then 'shipping.override_removed' else 'shipping.override_set' end,
        'product', new.product_id, jsonb_build_object('variant', new.variant, 'reason', new.override_reason,
          'from', case when tg_op = 'UPDATE' then old.override_contribution end, 'to', new.override_contribution));
    end if;
  elsif tg_op = 'UPDATE' then
    new.override_by := old.override_by; new.override_at := old.override_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger product_shipping_profiles_override before insert or update on public.product_shipping_profiles
  for each row execute function private.shipping_profile_override();

-- ----------------------------------------------------------------------------
-- 5. Clearance campaigns
-- ----------------------------------------------------------------------------
create table public.clearance_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  categories text[] not null default '{}',
  discount_kind text not null check (discount_kind in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  shipping_treatment text not null default 'normal' check (shipping_treatment in ('normal', 'reduced', 'subsidised', 'below_target')),
  -- % of the normal contribution kept (reduced, below_target, subsidised).
  keep_pct numeric(5,2) check (keep_pct is null or keep_pct between 0 and 100),
  subsidy_budget numeric(12,2) check (subsidy_budget is null or subsidy_budget >= 0),
  max_subsidy_per_item numeric(12,2) check (max_subsidy_per_item is null or max_subsidy_per_item >= 0),
  min_margin_pct numeric(5,2) check (min_margin_pct is null or min_margin_pct between -100 and 100),
  funding_source text check (funding_source is null or length(funding_source) <= 200),
  notes text check (notes is null or length(notes) <= 2000),
  approved_by uuid,
  approved_at timestamptz,
  approval_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (ends_at > starts_at),
  check (discount_kind <> 'percent' or discount_value < 100),
  check (shipping_treatment <> 'subsidised' or subsidy_budget is not null)
);
create index clearance_campaigns_tenant_idx on public.clearance_campaigns (tenant_id, status, ends_at);

create table public.clearance_campaign_products (
  campaign_id uuid not null,
  product_id text not null,
  tenant_id uuid not null,
  applied_price numeric(12,2),
  previous_price numeric(12,2),
  previous_original_price numeric(12,2),
  applied_at timestamptz,
  restored_at timestamptz,
  exception_reason text check (exception_reason is null or length(exception_reason) <= 500),
  exception_approved_by uuid,
  exception_approved_at timestamptz,
  primary key (campaign_id, product_id),
  foreign key (tenant_id, campaign_id) references public.clearance_campaigns (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
create index clearance_campaign_products_product_idx on public.clearance_campaign_products (product_id);

-- Changing what an approved campaign does withdraws its approval.
create or replace function private.clearance_campaign_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.approved_by := null; new.approved_at := null; new.approval_reason := null;
  elsif (new.shipping_treatment, new.keep_pct, new.subsidy_budget, new.max_subsidy_per_item, new.discount_kind, new.discount_value,
         new.min_margin_pct, new.starts_at, new.ends_at, new.categories)
        is distinct from
        (old.shipping_treatment, old.keep_pct, old.subsidy_budget, old.max_subsidy_per_item, old.discount_kind, old.discount_value,
         old.min_margin_pct, old.starts_at, old.ends_at, old.categories)
        and current_setting('app.shipping_internal', true) is distinct from 'on' then
    new.approved_by := null; new.approved_at := null; new.approval_reason := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger clearance_campaigns_rules before insert or update on public.clearance_campaigns
  for each row execute function private.clearance_campaign_rules();

-- ----------------------------------------------------------------------------
-- 6. What each order allocated
-- ----------------------------------------------------------------------------
alter table public.checkouts add column shipping_allocation jsonb
  check (shipping_allocation is null or jsonb_typeof(shipping_allocation) = 'object');

create table public.order_shipping_allocations (
  order_id uuid primary key,
  tenant_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and jsonb_typeof(snapshot -> 'lines') = 'array'),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete restrict
);
create index order_shipping_allocations_tenant_idx on public.order_shipping_allocations (tenant_id, created_at desc);

create or replace function private.order_shipping_allocation_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'An order’s shipping allocation is kept as it was when the order was placed.' using errcode = '42501';
end $$;
create trigger order_shipping_allocations_immutable before update or delete on public.order_shipping_allocations
  for each row execute function private.order_shipping_allocation_immutable();

-- open_checkout also saves the allocation the server worked out (or nothing).
create or replace function public.open_checkout(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.check_holds(p -> 'items', (p ->> 'store_id')::uuid, null);
  insert into public.checkouts (
    tenant_id, store_id, reference, order_number, tracking_number, email, shipping_address, shipping_city,
    shipping_state, shipping_postal_code, shipping_country, currency, items, subtotal, discount, total,
    promo_code_id, promo_code, is_preorder, terms_version, terms_accepted_at, hold_until, shipping_allocation)
  values (
    (p ->> 'tenant_id')::uuid, (p ->> 'store_id')::uuid, p ->> 'reference', p ->> 'order_number', p ->> 'tracking_number',
    p ->> 'email', p ->> 'shipping_address', p ->> 'shipping_city', p ->> 'shipping_state', p ->> 'shipping_postal_code',
    p ->> 'shipping_country', p ->> 'currency', p -> 'items', (p ->> 'subtotal')::numeric, (p ->> 'discount')::numeric,
    (p ->> 'total')::numeric, (p ->> 'promo_code_id')::uuid, p ->> 'promo_code', coalesce((p ->> 'is_preorder')::boolean, false),
    p ->> 'terms_version', (p ->> 'terms_accepted_at')::timestamptz, now() + interval '30 minutes',
    case when jsonb_typeof(p -> 'shipping') = 'object' then p -> 'shipping' end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.open_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.open_checkout(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 7. Freight shipments, inventory batches and reconciliation
-- ----------------------------------------------------------------------------
create table public.freight_shipments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reference text not null check (length(reference) between 1 and 60),
  -- orders: a consolidated air shipment of customer orders;
  -- inventory: stock bought in advance (sea freight, or a planned air batch).
  kind text not null check (kind in ('orders', 'inventory')),
  method text not null check (method in ('air', 'sea')),
  rate_id uuid,
  status text not null default 'planning' check (status in ('planning', 'booked', 'in_transit', 'arrived', 'reconciled', 'cancelled')),
  allocation_method text not null default 'chargeable_weight'
    check (allocation_method in ('value', 'weight', 'volume', 'chargeable_weight', 'quantity', 'hybrid')),
  estimated_units numeric(12,3),
  estimated_cost numeric(12,2),
  estimate jsonb,
  estimated_at timestamptz,
  dispatched_on date,
  arrived_on date,
  notes text check (notes is null or length(notes) <= 2000),
  documents jsonb not null default '[]' check (jsonb_typeof(documents) = 'array' and jsonb_array_length(documents) <= 20),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reconciled_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, rate_id) references public.shipping_rates (tenant_id, id),
  check (kind = 'inventory' or method = 'air')
);

create table public.freight_shipment_orders (
  order_id uuid primary key,
  shipment_id uuid not null,
  tenant_id uuid not null,
  added_at timestamptz not null default now(),
  foreign key (tenant_id, shipment_id) references public.freight_shipments (tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete restrict
);
create index freight_shipment_orders_shipment_idx on public.freight_shipment_orders (shipment_id);

create table public.freight_shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  tenant_id uuid not null,
  product_id text not null,
  quantity_ordered integer not null check (quantity_ordered > 0 and quantity_ordered <= 1000000),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  cost_currency char(3) not null default 'CNY' check (cost_currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(14,6) check (fx_rate is null or fx_rate > 0),
  unit_weight_kg numeric(10,3) check (unit_weight_kg is null or unit_weight_kg > 0),
  unit_cbm numeric(12,6) check (unit_cbm is null or unit_cbm > 0),
  estimated_landed_unit numeric(12,2),
  allocated_costs numeric(12,2),
  reconciled_landed_unit numeric(12,2),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, shipment_id) references public.freight_shipments (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete restrict,
  check (quantity_received <= quantity_ordered)
);
create index freight_shipment_lines_shipment_idx on public.freight_shipment_lines (shipment_id);
create index freight_shipment_lines_product_idx on public.freight_shipment_lines (product_id);

create table public.freight_receipts (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null,
  tenant_id uuid not null,
  quantity integer not null check (quantity > 0),
  idempotency_key text not null check (length(idempotency_key) between 8 and 80),
  received_by uuid,
  received_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, line_id) references public.freight_shipment_lines (tenant_id, id) on delete restrict
);

create table public.freight_invoices (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  tenant_id uuid not null,
  invoice_ref text check (invoice_ref is null or length(invoice_ref) <= 80),
  invoice_date date,
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(14,6) check (fx_rate is null or fx_rate > 0),
  chargeable_actual numeric(12,3) check (chargeable_actual is null or chargeable_actual >= 0),
  freight_amount numeric(12,2) not null default 0 check (freight_amount >= 0),
  additional_fees numeric(12,2) not null default 0 check (additional_fees >= 0),
  clearance_charges numeric(12,2) not null default 0 check (clearance_charges >= 0),
  insurance numeric(12,2) not null default 0 check (insurance >= 0),
  handling numeric(12,2) not null default 0 check (handling >= 0),
  other_costs numeric(12,2) not null default 0 check (other_costs >= 0),
  total_ngn numeric(14,2) generated always as (round(
    (freight_amount + additional_fees + clearance_charges + insurance + handling + other_costs)
    * case when currency = 'NGN' then 1 else coalesce(fx_rate, 0) end, 2)) stored,
  document_url text check (document_url is null or length(document_url) <= 2000),
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, shipment_id) references public.freight_shipments (tenant_id, id) on delete cascade,
  check (currency = 'NGN' or fx_rate is not null)
);
create index freight_invoices_shipment_idx on public.freight_invoices (shipment_id);

create table public.freight_reconciliations (
  shipment_id uuid primary key,
  tenant_id uuid not null,
  estimated_cost numeric(14,2),
  actual_cost numeric(14,2) not null,
  variance numeric(14,2),
  variance_pct numeric(8,1),
  recovered numeric(14,2) not null default 0,
  subsidies numeric(14,2) not null default 0,
  reserve_drawn numeric(14,2) not null default 0,
  surplus_to_reserve numeric(14,2) not null default 0,
  unfunded numeric(14,2) not null default 0,
  allocation jsonb not null default '[]',
  finalized_by uuid,
  finalized_at timestamptz not null default now(),
  foreign key (tenant_id, shipment_id) references public.freight_shipments (tenant_id, id) on delete restrict
);

-- Reconciliations, receipts and allocations are records: never edited or removed.
create trigger freight_reconciliations_immutable before update or delete on public.freight_reconciliations
  for each row execute function private.order_shipping_allocation_immutable();
create trigger freight_receipts_immutable before update or delete on public.freight_receipts
  for each row execute function private.order_shipping_allocation_immutable();

-- A shipment's estimate is kept once it leaves planning; reconciled is set
-- only by finalising; a reconciled shipment's orders, lines and invoices stay put.
create or replace function private.freight_shipment_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    if new.status = 'reconciled' then raise exception 'A shipment is reconciled by finalising its invoice.' using errcode = '22023'; end if;
    return new;
  end if;
  if old.status = 'reconciled' and current_setting('app.shipping_internal', true) is distinct from 'on'
     and (new.status, new.estimated_cost, new.allocation_method, new.kind, new.method) is distinct from (old.status, old.estimated_cost, old.allocation_method, old.kind, old.method) then
    raise exception 'This shipment is reconciled; its figures are final.' using errcode = '22023';
  end if;
  if new.status = 'reconciled' and old.status <> 'reconciled' and current_setting('app.shipping_internal', true) is distinct from 'on' then
    raise exception 'A shipment is reconciled by finalising its invoice.' using errcode = '22023';
  end if;
  if old.status <> 'planning' and (new.estimated_cost, new.estimated_units, new.estimate) is distinct from (old.estimated_cost, old.estimated_units, old.estimate) then
    raise exception 'The estimate is kept as it was when the shipment was booked.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger freight_shipments_rules before insert or update on public.freight_shipments
  for each row execute function private.freight_shipment_rules();

create or replace function private.freight_child_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ship public.freight_shipments;
  v_row record := case when tg_op = 'DELETE' then old else new end;
  v_order public.orders;
begin
  select * into v_ship from public.freight_shipments where id = v_row.shipment_id;
  if v_ship.status = 'reconciled' and current_setting('app.shipping_internal', true) is distinct from 'on' then
    raise exception 'This shipment is reconciled; its figures are final.' using errcode = '22023';
  end if;
  if tg_table_name = 'freight_shipment_orders' and tg_op = 'INSERT' then
    if v_ship.kind <> 'orders' then raise exception 'Orders go on order shipments, not inventory batches.' using errcode = '22023'; end if;
    select * into v_order from public.orders where id = new.order_id;
    if v_order.payment_status not in ('paid', 'partially_refunded') or v_order.status = 'cancelled' then
      raise exception 'Only paid orders that aren’t cancelled can be added to a shipment (%).', v_order.order_number using errcode = '22023';
    end if;
  end if;
  if tg_table_name = 'freight_shipment_lines' and tg_op = 'INSERT' and v_ship.kind <> 'inventory' then
    raise exception 'Products go on inventory batches; order shipments carry orders.' using errcode = '22023';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger freight_shipment_orders_rules before insert or update or delete on public.freight_shipment_orders
  for each row execute function private.freight_child_rules();
create trigger freight_shipment_lines_rules before insert or update or delete on public.freight_shipment_lines
  for each row execute function private.freight_child_rules();
create trigger freight_invoices_rules before insert or update or delete on public.freight_invoices
  for each row execute function private.freight_child_rules();

-- ----------------------------------------------------------------------------
-- 8. The shipping ledger (append-only)
-- ----------------------------------------------------------------------------
create table public.shipping_ledger (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  occurred_at timestamptz not null default now(),
  kind text not null check (kind in ('freight_recovery', 'logistics_reserve', 'platform_revenue', 'promo_subsidy', 'unfunded_freight')),
  amount numeric(14,2) not null check (amount <> 0),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  order_id uuid,
  product_id text,
  shipment_id uuid,
  campaign_id uuid,
  reason text not null check (reason in ('order_paid', 'order_cancelled', 'order_refunded', 'reconciliation', 'reserve_draw', 'manual_adjustment')),
  memo text check (memo is null or length(memo) <= 500),
  reversal_of bigint references public.shipping_ledger (id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) <= 200),
  actor_user_id uuid,
  actor_type text not null default 'system',
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, shipment_id) references public.freight_shipments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, campaign_id) references public.clearance_campaigns (tenant_id, id) on delete restrict
);
create index shipping_ledger_tenant_idx on public.shipping_ledger (tenant_id, occurred_at desc);
create index shipping_ledger_order_idx on public.shipping_ledger (order_id) where order_id is not null;
create index shipping_ledger_shipment_idx on public.shipping_ledger (shipment_id) where shipment_id is not null;
create index shipping_ledger_campaign_idx on public.shipping_ledger (campaign_id, kind) where campaign_id is not null;

create or replace function private.shipping_ledger_actor() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actor_user_id := (select auth.uid());
  new.actor_type := private.current_actor_type();
  return new;
end $$;
create trigger shipping_ledger_actor before insert on public.shipping_ledger
  for each row execute function private.shipping_ledger_actor();
create trigger shipping_ledger_no_update before update or delete on public.shipping_ledger
  for each row execute function private.audit_is_append_only();
create trigger shipping_ledger_no_truncate before truncate on public.shipping_ledger
  for each statement execute function private.audit_is_append_only();

-- Posts a paid order's allocation. Idempotent: each line and kind has one key,
-- so a repeated payment confirmation adds nothing. A campaign's subsidy never
-- goes past what is left of its budget, whatever the snapshot says.
create or replace function private.post_order_shipping(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_alloc public.order_shipping_allocations;
  v_line jsonb;
  v_idx integer;
  v_kind text;
  v_amount numeric;
  v_campaign uuid;
  v_budget numeric;
begin
  select * into v_alloc from public.order_shipping_allocations where order_id = p_order;
  if not found then return; end if;
  for v_line, v_idx in select value, ordinality::int from jsonb_array_elements(v_alloc.snapshot -> 'lines') with ordinality loop
    v_campaign := case when coalesce(v_line ->> 'campaignId', '') ~ '^[0-9a-f-]{36}$' then (v_line ->> 'campaignId')::uuid end;
    foreach v_kind in array array['freight_recovery', 'logistics_reserve', 'platform_revenue', 'promo_subsidy'] loop
      v_amount := round(coalesce((v_line ->> case v_kind when 'freight_recovery' then 'recoveryKobo' when 'logistics_reserve' then 'reserveKobo'
        when 'platform_revenue' then 'platformKobo' else 'subsidyKobo' end)::numeric, 0) / 100, 2);
      if v_kind = 'promo_subsidy' and v_amount > 0 then
        select subsidy_budget into v_budget from public.clearance_campaigns
         where id = v_campaign and tenant_id = v_alloc.tenant_id for update;
        v_amount := least(v_amount, greatest(coalesce(v_budget, 0) - coalesce((select sum(amount) from public.shipping_ledger
          where campaign_id = v_campaign and kind = 'promo_subsidy'), 0), 0));
      end if;
      continue when v_amount is null or v_amount <= 0;
      insert into public.shipping_ledger (tenant_id, kind, amount, order_id, product_id, campaign_id, reason, idempotency_key)
      values (v_alloc.tenant_id, v_kind, v_amount, p_order, v_line ->> 'productId',
        case when v_kind = 'promo_subsidy' or v_campaign is not null then v_campaign end, 'order_paid',
        format('order:%s:%s:%s', p_order, v_idx, v_kind))
      on conflict (tenant_id, idempotency_key) do nothing;
    end loop;
  end loop;
end $$;

-- Reverses everything an order posted, once (a cancelled or fully refunded order).
create or replace function private.reverse_order_shipping(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.shipping_ledger (tenant_id, kind, amount, order_id, product_id, shipment_id, campaign_id, reason, reversal_of, idempotency_key)
  select e.tenant_id, e.kind, -e.amount, e.order_id, e.product_id, e.shipment_id, e.campaign_id, p_reason, e.id, 'reverse:' || e.id
    from public.shipping_ledger e
   where e.order_id = p_order and e.reason = 'order_paid' and e.reversal_of is null
  on conflict (tenant_id, idempotency_key) do nothing;
end $$;

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
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform private.reverse_order_shipping(new.id, 'order_cancelled');
  elsif new.payment_status = 'refunded' and old.payment_status <> 'refunded' then
    perform private.reverse_order_shipping(new.id, 'order_refunded');
  end if;
  return null;
end $$;
create trigger orders_shipping after insert or update of payment_status, status on public.orders
  for each row execute function private.order_shipping_events();

-- ----------------------------------------------------------------------------
-- 9. Staff actions that move money records (each checks its own permission)
-- ----------------------------------------------------------------------------
create or replace function private.require(p_tenant uuid, p_permission text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.jwt() ->> 'role') = 'service_role' then return; end if;
  if not private.has_permission(p_tenant, p_permission) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
end $$;

-- A manual ledger entry, with a reason. The key makes a double submit harmless.
create or replace function public.adjust_shipping_ledger(p_tenant uuid, p jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_memo text := trim(coalesce(p ->> 'memo', ''));
begin
  perform private.require(p_tenant, 'finance.adjust');
  if length(v_memo) < 5 then raise exception 'Give a reason for the adjustment.' using errcode = '22023'; end if;
  if coalesce((p ->> 'amount')::numeric, 0) = 0 then raise exception 'The amount can’t be zero.' using errcode = '22023'; end if;
  if coalesce(p ->> 'key', '') !~ '^[A-Za-z0-9-]{8,80}$' then raise exception 'Missing request key.' using errcode = '22023'; end if;
  insert into public.shipping_ledger (tenant_id, kind, amount, order_id, shipment_id, campaign_id, product_id, reason, memo, idempotency_key)
  values (p_tenant, p ->> 'kind', round((p ->> 'amount')::numeric, 2), (p ->> 'order_id')::uuid, (p ->> 'shipment_id')::uuid,
    (p ->> 'campaign_id')::uuid, p ->> 'product_id', 'manual_adjustment', v_memo, 'manual:' || (p ->> 'key'))
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_id;
  if v_id is not null then
    perform private.audit(p_tenant, 'shipping.ledger_adjusted', 'shipping_ledger', v_id::text,
      jsonb_build_object('kind', p ->> 'kind', 'amount', p ->> 'amount', 'memo', v_memo));
  end if;
  return v_id;
end $$;

-- Receives units of an inventory batch line into stock, once per key.
create or replace function public.receive_inventory(p_line uuid, p_quantity integer, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_line public.freight_shipment_lines;
  v_ship public.freight_shipments;
  v_receipt uuid;
begin
  select * into v_line from public.freight_shipment_lines where id = p_line for update;
  if not found then raise exception 'That batch line doesn’t exist.' using errcode = '22023'; end if;
  perform private.require(v_line.tenant_id, 'shipping.manage');
  select * into v_ship from public.freight_shipments where id = v_line.shipment_id;
  if v_ship.status = 'cancelled' then raise exception 'This batch was cancelled.' using errcode = '22023'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Receive at least one unit.' using errcode = '22023'; end if;
  -- A retried request (same key) is answered before any check, so it can't fail or count twice.
  if exists (select 1 from public.freight_receipts where tenant_id = v_line.tenant_id and idempotency_key = p_key) then
    return jsonb_build_object('duplicate', true, 'received', v_line.quantity_received);
  end if;
  if v_line.quantity_received + p_quantity > v_line.quantity_ordered then
    raise exception 'That’s more than was ordered (% of % already received).', v_line.quantity_received, v_line.quantity_ordered using errcode = '22023';
  end if;
  insert into public.freight_receipts (line_id, tenant_id, quantity, idempotency_key, received_by)
  values (p_line, v_line.tenant_id, p_quantity, p_key, (select auth.uid()))
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_receipt;
  if v_receipt is null then
    return jsonb_build_object('duplicate', true, 'received', v_line.quantity_received);
  end if;
  perform set_config('app.shipping_internal', 'on', true);
  update public.freight_shipment_lines set quantity_received = quantity_received + p_quantity where id = p_line;
  perform set_config('app.shipping_internal', 'off', true);
  -- Stock is the products' own count (the one checkout reads); untracked stock stays untracked.
  update public.products set stock = stock + p_quantity where id = v_line.product_id and tenant_id = v_line.tenant_id and stock is not null;
  update public.product_sources set incoming_quantity = greatest(0, incoming_quantity - p_quantity)
   where product_id = v_line.product_id and tenant_id = v_line.tenant_id;
  perform private.audit(v_line.tenant_id, 'inventory.received', 'product', v_line.product_id,
    jsonb_build_object('shipment', v_ship.reference, 'quantity', p_quantity));
  return jsonb_build_object('duplicate', false, 'received', v_line.quantity_received + p_quantity);
end $$;

-- Finalises a shipment against its invoices. The figures come from the
-- engine on the server; this checks the ones the database can prove (the
-- invoice total, what the shipment's orders recovered, the reserve balance)
-- and refuses anything that doesn't add up.
create or replace function public.finalize_freight_reconciliation(p_shipment uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ship public.freight_shipments;
  v_actual numeric;
  v_recovered numeric := 0;
  v_subsidy numeric := 0;
  v_reserve numeric;
  v_draw numeric := round(coalesce((p ->> 'reserve_drawn')::numeric, 0), 2);
  v_surplus numeric := round(coalesce((p ->> 'surplus_to_reserve')::numeric, 0), 2);
  v_unfunded numeric;
  v_line jsonb;
  v_sum numeric := 0;
begin
  select * into v_ship from public.freight_shipments where id = p_shipment for update;
  if not found then raise exception 'That shipment doesn’t exist.' using errcode = '22023'; end if;
  perform private.require(v_ship.tenant_id, 'finance.adjust');
  if v_ship.status in ('reconciled', 'cancelled') then raise exception 'This shipment is already %.', v_ship.status using errcode = '22023'; end if;
  select sum(total_ngn) into v_actual from public.freight_invoices where shipment_id = p_shipment;
  if v_actual is null then raise exception 'Enter the freight invoice first.' using errcode = '22023'; end if;
  if round((p ->> 'actual_cost')::numeric, 2) is distinct from v_actual then
    raise exception 'The invoices changed while you were reviewing. Reload and check again.' using errcode = '22023';
  end if;

  if v_ship.kind = 'orders' then
    select coalesce(sum(amount) filter (where kind = 'freight_recovery'), 0), coalesce(sum(amount) filter (where kind = 'promo_subsidy'), 0)
      into v_recovered, v_subsidy
      from public.shipping_ledger
     where order_id in (select order_id from public.freight_shipment_orders where shipment_id = p_shipment);
    if round((p ->> 'recovered')::numeric, 2) is distinct from v_recovered or round((p ->> 'subsidies')::numeric, 2) is distinct from v_subsidy then
      raise exception 'Recovery figures changed while you were reviewing. Reload and check again.' using errcode = '22023';
    end if;
  else
    for v_line in select value from jsonb_array_elements(coalesce(p -> 'lines', '[]')) loop
      v_sum := v_sum + round((v_line ->> 'allocated')::numeric, 2);
    end loop;
    if v_sum is distinct from v_actual then
      raise exception 'The allocation (%) doesn’t add up to the invoices (%).', v_sum, v_actual using errcode = '22023';
    end if;
    v_draw := 0; v_surplus := 0;
  end if;

  select coalesce(sum(amount), 0) into v_reserve from public.shipping_ledger where tenant_id = v_ship.tenant_id and kind = 'logistics_reserve';
  if v_draw < 0 or v_draw > greatest(v_reserve, 0) or v_draw > greatest(v_actual - v_recovered - v_subsidy, 0) then
    raise exception 'The reserve can cover at most the shortfall, and only what it holds.' using errcode = '22023';
  end if;
  if v_surplus < 0 or v_surplus > greatest(v_recovered + v_subsidy - v_actual, 0) then
    raise exception 'Only an actual surplus can go to the reserve.' using errcode = '22023';
  end if;
  v_unfunded := case when v_ship.kind = 'orders' then greatest(v_actual - v_recovered - v_subsidy - v_draw, 0) else 0 end;

  insert into public.freight_reconciliations (shipment_id, tenant_id, estimated_cost, actual_cost, variance, variance_pct,
    recovered, subsidies, reserve_drawn, surplus_to_reserve, unfunded, allocation, finalized_by)
  values (p_shipment, v_ship.tenant_id, v_ship.estimated_cost, v_actual, v_actual - v_ship.estimated_cost,
    case when coalesce(v_ship.estimated_cost, 0) > 0 then round((v_actual - v_ship.estimated_cost) / v_ship.estimated_cost * 100, 1) end,
    v_recovered, v_subsidy, v_draw, v_surplus, v_unfunded, coalesce(p -> 'allocation', p -> 'lines', '[]'), (select auth.uid()));

  if v_draw > 0 then
    insert into public.shipping_ledger (tenant_id, kind, amount, shipment_id, reason, memo, idempotency_key)
    values (v_ship.tenant_id, 'logistics_reserve', -v_draw, p_shipment, 'reserve_draw', 'Freight shortfall on ' || v_ship.reference, 'reconcile:' || p_shipment || ':draw');
  end if;
  if v_surplus > 0 then
    insert into public.shipping_ledger (tenant_id, kind, amount, shipment_id, reason, memo, idempotency_key)
    values (v_ship.tenant_id, 'logistics_reserve', v_surplus, p_shipment, 'reconciliation', 'Freight surplus on ' || v_ship.reference, 'reconcile:' || p_shipment || ':surplus');
  end if;
  if v_unfunded > 0 then
    insert into public.shipping_ledger (tenant_id, kind, amount, shipment_id, reason, memo, idempotency_key)
    values (v_ship.tenant_id, 'unfunded_freight', v_unfunded, p_shipment, 'reconciliation', 'Unfunded freight on ' || v_ship.reference, 'reconcile:' || p_shipment || ':unfunded');
  end if;

  perform set_config('app.shipping_internal', 'on', true);
  for v_line in select value from jsonb_array_elements(coalesce(p -> 'lines', '[]')) loop
    update public.freight_shipment_lines set allocated_costs = round((v_line ->> 'allocated')::numeric, 2),
           reconciled_landed_unit = round((v_line ->> 'landed_unit')::numeric, 2)
     where id = (v_line ->> 'id')::uuid and shipment_id = p_shipment;
  end loop;
  update public.freight_shipments set status = 'reconciled', reconciled_at = now() where id = p_shipment;
  perform set_config('app.shipping_internal', 'off', true);

  perform private.audit(v_ship.tenant_id, 'shipping.reconciled', 'freight_shipment', v_ship.reference,
    jsonb_build_object('actual', v_actual, 'estimated', v_ship.estimated_cost, 'recovered', v_recovered, 'subsidies', v_subsidy,
      'reserve_drawn', v_draw, 'surplus_to_reserve', v_surplus, 'unfunded', v_unfunded));
end $$;

-- Finance approves a below-target campaign, or a product priced below its margin floor.
create or replace function public.approve_clearance(p_campaign uuid, p_product text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.clearance_campaigns;
begin
  select * into v_c from public.clearance_campaigns where id = p_campaign for update;
  if not found then raise exception 'That campaign doesn’t exist.' using errcode = '22023'; end if;
  perform private.require(v_c.tenant_id, 'finance.adjust');
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a reason for the approval.' using errcode = '22023'; end if;
  if p_product is null then
    perform set_config('app.shipping_internal', 'on', true);
    update public.clearance_campaigns set approved_by = (select auth.uid()), approved_at = now(), approval_reason = trim(p_reason) where id = p_campaign;
    perform set_config('app.shipping_internal', 'off', true);
  else
    insert into public.clearance_campaign_products (campaign_id, product_id, tenant_id, exception_reason, exception_approved_by, exception_approved_at)
    values (p_campaign, p_product, v_c.tenant_id, trim(p_reason), (select auth.uid()), now())
    on conflict (campaign_id, product_id) do update set exception_reason = excluded.exception_reason,
      exception_approved_by = excluded.exception_approved_by, exception_approved_at = excluded.exception_approved_at;
  end if;
  perform private.audit(v_c.tenant_id, 'shipping.clearance_approved', 'clearance_campaign', p_campaign::text,
    jsonb_build_object('product', p_product, 'reason', trim(p_reason)));
end $$;

-- ----------------------------------------------------------------------------
-- 10. Access
-- ----------------------------------------------------------------------------
alter table public.shipping_settings enable row level security;
alter table public.shipping_classes enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.product_shipping_profiles enable row level security;
alter table public.clearance_campaigns enable row level security;
alter table public.clearance_campaign_products enable row level security;
alter table public.order_shipping_allocations enable row level security;
alter table public.freight_shipments enable row level security;
alter table public.freight_shipment_orders enable row level security;
alter table public.freight_shipment_lines enable row level security;
alter table public.freight_receipts enable row level security;
alter table public.freight_invoices enable row level security;
alter table public.freight_reconciliations enable row level security;
alter table public.shipping_ledger enable row level security;

revoke all on public.shipping_settings, public.shipping_classes, public.shipping_rates, public.product_shipping_profiles,
  public.clearance_campaigns, public.clearance_campaign_products, public.order_shipping_allocations, public.freight_shipments,
  public.freight_shipment_orders, public.freight_shipment_lines, public.freight_receipts, public.freight_invoices,
  public.freight_reconciliations, public.shipping_ledger from anon, authenticated;
grant all on public.shipping_settings, public.shipping_classes, public.shipping_rates, public.product_shipping_profiles,
  public.clearance_campaigns, public.clearance_campaign_products, public.order_shipping_allocations, public.freight_shipments,
  public.freight_shipment_orders, public.freight_shipment_lines, public.freight_receipts, public.freight_invoices,
  public.freight_reconciliations, public.shipping_ledger to service_role;

-- Read: shipping.read (the ledger also finance.read). Records (allocations,
-- receipts, reconciliations, the ledger) have no write grant at all: only the
-- functions above and the order triggers write them.
grant select on public.shipping_settings, public.shipping_classes, public.shipping_rates, public.product_shipping_profiles,
  public.clearance_campaigns, public.clearance_campaign_products, public.order_shipping_allocations, public.freight_shipments,
  public.freight_shipment_orders, public.freight_shipment_lines, public.freight_receipts, public.freight_invoices,
  public.freight_reconciliations, public.shipping_ledger to authenticated;
grant insert, update on public.shipping_settings to authenticated;
grant insert, update, delete on public.shipping_classes, public.product_shipping_profiles, public.freight_shipment_orders,
  public.freight_shipment_lines, public.freight_invoices to authenticated;
grant insert, update on public.shipping_rates, public.freight_shipments to authenticated;
-- Approvals only through approve_clearance().
grant insert (tenant_id, name, starts_at, ends_at, status, categories, discount_kind, discount_value, shipping_treatment, keep_pct,
  subsidy_budget, max_subsidy_per_item, min_margin_pct, funding_source, notes) on public.clearance_campaigns to authenticated;
grant update (name, starts_at, ends_at, status, categories, discount_kind, discount_value, shipping_treatment, keep_pct,
  subsidy_budget, max_subsidy_per_item, min_margin_pct, funding_source, notes) on public.clearance_campaigns to authenticated;
grant insert (campaign_id, product_id, tenant_id, applied_price, previous_price, previous_original_price, applied_at, restored_at)
  on public.clearance_campaign_products to authenticated;
grant update (applied_price, previous_price, previous_original_price, applied_at, restored_at) on public.clearance_campaign_products to authenticated;
grant delete on public.clearance_campaign_products to authenticated;

create policy "Shipping readers see settings" on public.shipping_settings for select to authenticated
  using (tenant_id in (select private.permitted_tenants('shipping.read')));
create policy "Shipping managers set settings" on public.shipping_settings for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('shipping.manage')));
create policy "Shipping managers change settings" on public.shipping_settings for update to authenticated
  using (tenant_id in (select private.permitted_tenants('shipping.manage')))
  with check (tenant_id in (select private.permitted_tenants('shipping.manage')));

-- Tables that shipping.read sees and shipping.manage writes.
do $$
declare
  t text;
begin
  foreach t in array array['shipping_classes', 'shipping_rates', 'product_shipping_profiles', 'clearance_campaigns',
    'clearance_campaign_products', 'freight_shipments', 'freight_shipment_orders', 'freight_shipment_lines', 'freight_invoices'] loop
    execute format('create policy "Shipping readers see %1$s" on public.%1$I for select to authenticated
      using (tenant_id in (select private.permitted_tenants(''shipping.read'')))', t);
    execute format('create policy "Shipping managers add %1$s" on public.%1$I for insert to authenticated
      with check (tenant_id in (select private.permitted_tenants(''shipping.manage'')))', t);
    execute format('create policy "Shipping managers change %1$s" on public.%1$I for update to authenticated
      using (tenant_id in (select private.permitted_tenants(''shipping.manage'')))
      with check (tenant_id in (select private.permitted_tenants(''shipping.manage'')))', t);
    execute format('create policy "Shipping managers remove %1$s" on public.%1$I for delete to authenticated
      using (tenant_id in (select private.permitted_tenants(''shipping.manage'')))', t);
  end loop;
  foreach t in array array['order_shipping_allocations', 'freight_receipts', 'freight_reconciliations'] loop
    execute format('create policy "Shipping readers see %1$s" on public.%1$I for select to authenticated
      using (tenant_id in (select private.permitted_tenants(''shipping.read'')))', t);
  end loop;
end $$;
create policy "Shipping and finance readers see the ledger" on public.shipping_ledger for select to authenticated
  using (tenant_id in (select private.permitted_tenants('shipping.read')) or tenant_id in (select private.permitted_tenants('finance.read')));

revoke all on function private.shipping_rate_rules(), private.shipping_profile_override(), private.clearance_campaign_rules(),
  private.order_shipping_allocation_immutable(), private.freight_shipment_rules(), private.freight_child_rules(),
  private.shipping_ledger_actor(), private.post_order_shipping(uuid), private.reverse_order_shipping(uuid, text),
  private.order_shipping_events(), private.require(uuid, text) from public, anon, authenticated;
grant execute on function private.require(uuid, text) to authenticated, service_role;
grant execute on function private.post_order_shipping(uuid), private.reverse_order_shipping(uuid, text) to service_role;
revoke all on function public.adjust_shipping_ledger(uuid, jsonb), public.receive_inventory(uuid, integer, text),
  public.finalize_freight_reconciliation(uuid, jsonb), public.approve_clearance(uuid, text, text) from public, anon;
grant execute on function public.adjust_shipping_ledger(uuid, jsonb), public.receive_inventory(uuid, integer, text),
  public.finalize_freight_reconciliation(uuid, jsonb), public.approve_clearance(uuid, text, text) to authenticated, service_role;

commit;
