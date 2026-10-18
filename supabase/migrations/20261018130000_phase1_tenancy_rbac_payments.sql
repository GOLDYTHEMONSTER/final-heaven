-- Phase 1 foundation: tenancy, RBAC, audit log, order/payment state model,
-- payment inbox, rate limiting.
--
-- Builds on 20261018120000_enable_rls_and_admin_policies.sql and replaces its
-- "app_metadata.role = admin" policies with per-tenant permissions.
--
-- Safe on the live data as of 18 Oct 2026 (5 products, 4 orders, 0 drops,
-- 0 subscribers, 0 users): every existing row is assigned to the Final Heaven
-- tenant and store. All-or-nothing; gives up rather than queue behind locks.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Helpers live in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============================================================================
-- 1. Tenancy
-- ============================================================================
-- A tenant is one independent business (its own customers, money, staff).
-- A store is a storefront that a tenant operates. Final Heaven is one of each.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (length(name) between 1 and 200),
  default_currency char(3) not null default 'NGN' check (default_currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (length(name) between 1 and 200),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id) -- target for composite foreign keys
);
create index stores_slug_idx on public.stores (slug);

-- Platform operators. Platform health only: this grants NO access to any
-- tenant's business records.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. RBAC
-- ============================================================================
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

-- tenant_id null = system role template available to every tenant.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{2,40}$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_system = (tenant_id is null))
);
create unique index roles_tenant_key_idx on public.roles (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);
create index role_permissions_permission_idx on public.role_permissions (permission_key);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.membership_roles (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  primary key (membership_id, role_id)
);
create index membership_roles_role_idx on public.membership_roles (role_id);

-- A membership may only hold system roles or roles of its own tenant.
-- SECURITY DEFINER: it must see the role's real tenant even when RLS hides
-- that role from the person assigning it.
create or replace function private.check_membership_role_tenant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role_tenant uuid;
  v_member_tenant uuid;
begin
  select tenant_id into v_role_tenant from public.roles where id = new.role_id;
  select tenant_id into v_member_tenant from public.memberships where id = new.membership_id;
  if v_role_tenant is not null and v_role_tenant <> v_member_tenant then
    raise exception 'role % belongs to another tenant', new.role_id using errcode = '42501';
  end if;
  return new;
end $$;
create trigger membership_roles_tenant_check before insert or update on public.membership_roles
  for each row execute function private.check_membership_role_tenant();

insert into public.permissions (key, description) values
  ('products.read',    'View products, drops and stock levels'),
  ('products.write',   'Create, edit, publish and delete products and drops'),
  ('inventory.read',   'View inventory and stock movements'),
  ('inventory.adjust', 'Adjust stock through controlled movements'),
  ('orders.read',      'View orders and order history'),
  ('orders.update',    'Change order fulfilment status'),
  ('payments.read',    'View payment attempts and payment events'),
  ('payments.record',  'Record an offline payment (bank transfer, cash) against an order'),
  ('refunds.request',  'Request a refund'),
  ('refunds.approve',  'Approve or reject refund requests'),
  ('finance.read',     'View financial reports'),
  ('finance.export',   'Export financial data'),
  ('customers.read',   'View customer records and newsletter subscribers'),
  ('customers.update', 'Edit customer records'),
  ('analytics.read',   'View business analytics'),
  ('audit.read',       'View the audit log'),
  ('users.manage',     'Invite staff and change their roles'),
  ('settings.manage',  'Change store settings and integrations');

-- Starting templates. Tenants can define their own roles alongside these.
create temporary table seed_roles (key text, name text, description text, perms text[]) on commit drop;
insert into seed_roles values
  ('owner', 'Owner', 'Full access, including staff and settings', array(select key from public.permissions)),
  ('administrator', 'Administrator', 'Runs the store day to day; cannot approve refunds or export finance',
    array(select key from public.permissions where key not in ('refunds.approve', 'finance.export'))),
  ('finance_manager', 'Finance manager', 'Payments, refunds approval and financial reporting',
    array['orders.read', 'payments.read', 'payments.record', 'refunds.approve', 'finance.read', 'finance.export', 'analytics.read', 'audit.read']),
  ('sales_manager', 'Sales manager', 'Orders, customers and sales analytics',
    array['products.read', 'orders.read', 'orders.update', 'customers.read', 'customers.update', 'analytics.read']),
  ('inventory_manager', 'Inventory manager', 'Catalogue and stock',
    array['products.read', 'products.write', 'inventory.read', 'inventory.adjust']),
  ('customer_support', 'Customer support', 'Help customers; can request but not approve refunds',
    array['orders.read', 'payments.read', 'customers.read', 'customers.update', 'refunds.request']),
  ('fulfilment_staff', 'Fulfilment staff', 'Pick, pack and ship orders',
    array['orders.read', 'orders.update', 'inventory.read']),
  ('analyst', 'Analyst', 'Read-only access to reporting',
    array['products.read', 'orders.read', 'finance.read', 'analytics.read']),
  ('read_only', 'Read-only', 'View operational records without changing anything',
    array['products.read', 'orders.read', 'inventory.read', 'customers.read', 'analytics.read']);

insert into public.roles (tenant_id, key, name, description, is_system)
  select null::uuid, key, name, description, true from seed_roles;
insert into public.role_permissions (role_id, permission_key)
  select r.id, unnest(s.perms) from seed_roles s join public.roles r on r.key = s.key and r.tenant_id is null;

-- ============================================================================
-- 3. Permission checks (used by RLS policies and server code)
-- ============================================================================
-- SECURITY DEFINER so policies can read memberships without recursing into
-- their own RLS. Always scoped to the calling user via auth.uid(); lives in
-- the unexposed private schema.

create or replace function private.permitted_tenants(p_permission text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id and t.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_key = p_permission
   where m.user_id = (select auth.uid()) and m.status = 'active'
$$;

create or replace function private.has_permission(p_tenant uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.permitted_tenants(p_permission) t where t = p_tenant)
$$;

create or replace function private.member_tenants() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id from public.memberships m
   where m.user_id = (select auth.uid()) and m.status = 'active'
$$;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

-- Staff management guard (no privilege escalation): a manager may only act on
-- someone else's membership, may only manage members whose permissions are a
-- subset of their own, and may only assign roles whose permissions they hold.
-- So an Administrator cannot make themselves Owner or Finance manager.
create or replace function private.can_manage_membership(p_membership uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
     where m.id = p_membership
       and m.user_id <> (select auth.uid())
       and m.tenant_id in (select private.permitted_tenants('users.manage'))
       and not exists (
         select 1 from public.membership_roles mr
           join public.role_permissions rp on rp.role_id = mr.role_id
          where mr.membership_id = m.id
            and m.tenant_id not in (select private.permitted_tenants(rp.permission_key))))
$$;

create or replace function private.can_assign_role(p_membership uuid, p_role uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_membership(p_membership)
     and exists (
       select 1 from public.roles r join public.memberships m on m.id = p_membership
        where r.id = p_role and (r.tenant_id is null or r.tenant_id = m.tenant_id)
          and not exists (
            select 1 from public.role_permissions rp
             where rp.role_id = r.id
               and m.tenant_id not in (select private.permitted_tenants(rp.permission_key))))
$$;

-- What the signed-in user may do, per tenant. Used by the admin UI and API.
create or replace function public.my_tenant_access()
returns table (tenant_id uuid, tenant_slug text, tenant_name text, store_id uuid, permissions text[])
language sql stable security invoker set search_path = '' as $$
  select t.id, t.slug, t.name,
         (select s.id from public.stores s where s.tenant_id = t.id and s.status = 'active' order by s.created_at limit 1),
         array(select distinct p.key from public.permissions p
                where t.id in (select private.permitted_tenants(p.key)) order by 1)
    from public.tenants t
   where t.id in (select private.member_tenants()) and t.status = 'active'
$$;

create or replace function public.am_platform_admin() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.is_platform_admin() $$;

revoke all on function public.my_tenant_access(), public.am_platform_admin() from public, anon;
grant execute on function public.my_tenant_access(), public.am_platform_admin() to authenticated;

-- ============================================================================
-- 4. Default tenant and store; tenant columns on existing tables
-- ============================================================================
insert into public.tenants (slug, name, default_currency) values ('final-heaven', 'Final Heaven', 'NGN');
insert into public.stores (tenant_id, slug, name, currency)
  select id, 'final-heaven', 'Final Heaven', 'NGN' from public.tenants where slug = 'final-heaven';

create temporary table default_scope on commit drop as
  select t.id as tenant_id, s.id as store_id
    from public.tenants t join public.stores s on s.tenant_id = t.id
   where t.slug = 'final-heaven' and s.slug = 'final-heaven';

alter table public.products add column tenant_id uuid, add column store_id uuid;
alter table public.drops add column tenant_id uuid, add column store_id uuid;
alter table public.orders add column tenant_id uuid, add column store_id uuid;
alter table public.newsletter_subscribers add column tenant_id uuid, add column store_id uuid;

update public.products set (tenant_id, store_id) = (select tenant_id, store_id from default_scope);
update public.drops set (tenant_id, store_id) = (select tenant_id, store_id from default_scope);
update public.orders set (tenant_id, store_id) = (select tenant_id, store_id from default_scope);
update public.newsletter_subscribers set (tenant_id, store_id) = (select tenant_id, store_id from default_scope);

alter table public.products alter column tenant_id set not null, alter column store_id set not null,
  add constraint products_store_fk foreign key (tenant_id, store_id) references public.stores (tenant_id, id),
  add constraint products_tenant_id_key unique (tenant_id, id);
alter table public.drops alter column tenant_id set not null, alter column store_id set not null,
  add constraint drops_store_fk foreign key (tenant_id, store_id) references public.stores (tenant_id, id);
alter table public.orders alter column tenant_id set not null, alter column store_id set not null,
  add constraint orders_store_fk foreign key (tenant_id, store_id) references public.stores (tenant_id, id),
  add constraint orders_tenant_id_key unique (tenant_id, id);
alter table public.newsletter_subscribers alter column tenant_id set not null, alter column store_id set not null,
  add constraint newsletter_store_fk foreign key (tenant_id, store_id) references public.stores (tenant_id, id);

-- Subscriber emails are unique per tenant, not globally.
alter table public.newsletter_subscribers drop constraint if exists newsletter_subscribers_email_key;
alter table public.newsletter_subscribers add constraint newsletter_subscribers_tenant_email_key unique (tenant_id, email);

create index products_store_status_idx on public.products (store_id, status, created_at desc);
create index drops_store_status_idx on public.drops (store_id, status, release_date desc);
create index orders_tenant_created_idx on public.orders (tenant_id, created_at desc);

-- A row can never be moved to another tenant.
create or replace function private.prevent_tenant_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tenant_id is distinct from old.tenant_id or new.store_id is distinct from old.store_id then
    raise exception 'tenant_id and store_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger products_tenant_immutable before update on public.products for each row execute function private.prevent_tenant_change();
create trigger drops_tenant_immutable before update on public.drops for each row execute function private.prevent_tenant_change();
create trigger orders_tenant_immutable before update on public.orders for each row execute function private.prevent_tenant_change();
create trigger newsletter_tenant_immutable before update on public.newsletter_subscribers for each row execute function private.prevent_tenant_change();

-- ============================================================================
-- 5. Audit log (append-only)
-- ============================================================================
create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  tenant_id uuid references public.tenants (id) on delete restrict, -- null = platform-level event
  actor_user_id uuid,
  actor_type text not null check (actor_type in ('user', 'system', 'webhook', 'job')),
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  entity_type text,
  entity_id text,
  request_id text,
  metadata jsonb not null default '{}'
);
create index audit_events_tenant_time_idx on public.audit_events (tenant_id, occurred_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

create or replace function private.audit_is_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end $$;
create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function private.audit_is_append_only();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function private.audit_is_append_only();

-- Who is acting, for triggers and functions: the JWT user if any, otherwise
-- the actor type the server set for this transaction ('system' by default).
create or replace function private.current_actor_type() returns text
language sql stable set search_path = '' as $$
  select case
    when (select auth.uid()) is not null then 'user'
    else coalesce(nullif(current_setting('app.actor_type', true), ''), 'system')
  end
$$;

create or replace function private.audit(p_tenant uuid, p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, request_id, metadata)
  values (p_tenant, (select auth.uid()), private.current_actor_type(), p_action, p_entity_type, p_entity_id,
          nullif(current_setting('app.request_id', true), ''), coalesce(p_metadata, '{}'::jsonb))
$$;
-- Currency exponent (minor units per major unit) in one place.
create or replace function private.currency_exponent(p_currency text) returns integer
language sql immutable set search_path = '' as $$
  select case when p_currency in ('XOF', 'XAF', 'UGX', 'RWF', 'GNF', 'JPY', 'KRW', 'VND', 'CLP') then 0 else 2 end
$$;

-- ============================================================================
-- 6. Orders: currency, payment status separate from fulfilment status
-- ============================================================================
alter table public.orders add column currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$');
alter table public.orders add column payment_status text not null default 'unpaid';

-- Legacy rows: no payment was ever verified by the system. Orders that had
-- moved past "ordered" were presumably paid offline, so they are marked
-- 'unverified' rather than claimed as paid.
update public.orders set payment_status = case when status = 'ordered' then 'unpaid' else 'unverified' end;
update public.orders set status = 'pending_payment' where status = 'ordered';
alter table public.orders alter column status set default 'pending_payment';

alter table public.orders add constraint orders_status_check check (status in
  ('pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));
alter table public.orders add constraint orders_payment_status_check check (payment_status in
  ('unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded', 'unverified'));

create table public.order_status_transitions (
  from_status text not null,
  to_status text not null,
  requires_payment boolean not null default false,
  primary key (from_status, to_status)
);
insert into public.order_status_transitions (from_status, to_status, requires_payment) values
  ('pending_payment', 'confirmed', true),
  ('pending_payment', 'cancelled', false),
  ('confirmed', 'processing', false),
  ('confirmed', 'cancelled', false),
  ('processing', 'shipped', false),
  ('processing', 'cancelled', false),
  ('shipped', 'delivered', false);

create table public.order_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  order_id uuid not null,
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type in ('created', 'status_changed', 'payment_status_changed')),
  from_value text,
  to_value text,
  actor_user_id uuid,
  actor_type text not null,
  metadata jsonb not null default '{}',
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete restrict
);
create index order_events_order_idx on public.order_events (order_id, occurred_at);

create or replace function private.enforce_order_transition() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_rule public.order_status_transitions;
begin
  if new.status is distinct from old.status then
    select * into v_rule from public.order_status_transitions
     where from_status = old.status and to_status = new.status;
    if not found then
      raise exception 'invalid order status transition: % -> %', old.status, new.status using errcode = 'P0001', hint = 'order_transition';
    end if;
    if v_rule.requires_payment and new.payment_status <> 'paid' then
      raise exception 'order % cannot be confirmed before payment is verified', old.order_number using errcode = 'P0001', hint = 'order_transition';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger orders_enforce_transition before update on public.orders
  for each row execute function private.enforce_order_transition();

-- order_events is the record; orders.timeline is a customer-facing copy kept
-- for the existing tracking page, maintained only by this trigger.
create or replace function private.record_order_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_type text := private.current_actor_type();
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (tenant_id, order_id, event_type, to_value, actor_user_id, actor_type)
    values (new.tenant_id, new.id, 'created', new.status, v_actor, v_type);
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.order_events (tenant_id, order_id, event_type, from_value, to_value, actor_user_id, actor_type)
    values (new.tenant_id, new.id, 'status_changed', old.status, new.status, v_actor, v_type);
    update public.orders set timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'status', new.status, 'date', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
        'time', to_char(now() at time zone 'UTC', 'HH24:MI'), 'description', 'Status updated to ' || replace(new.status, '_', ' ')))
     where id = new.id;
    perform private.audit(new.tenant_id, 'order.status_changed', 'order', new.order_number,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.payment_status is distinct from old.payment_status then
    insert into public.order_events (tenant_id, order_id, event_type, from_value, to_value, actor_user_id, actor_type)
    values (new.tenant_id, new.id, 'payment_status_changed', old.payment_status, new.payment_status, v_actor, v_type);
  end if;
  return null;
end $$;
create trigger orders_record_events after insert or update of status, payment_status on public.orders
  for each row execute function private.record_order_events();

-- ============================================================================
-- 7. Payments (integer minor units) and the provider event inbox
-- ============================================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  order_id uuid not null,
  provider text not null check (provider in ('flutterwave', 'manual')),
  reference text not null unique check (reference ~ '^[A-Z0-9-]{8,64}$'),
  provider_transaction_id text,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'initiated'
    check (status in ('initiated', 'pending', 'successful', 'failed', 'cancelled', 'abandoned')),
  checkout_url text,
  paid_amount_minor bigint,
  paid_currency char(3),
  failure_reason text,
  method text,            -- manual payments: bank_transfer, cash, payment_link
  recorded_by uuid,       -- manual payments: the staff member
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete restrict,
  unique (provider, provider_transaction_id)
);
create index payments_order_idx on public.payments (order_id, created_at desc);
create index payments_open_idx on public.payments (status, created_at) where status in ('initiated', 'pending');
create trigger payments_touch before update on public.payments for each row execute function private.touch_updated_at();

-- Completed payments are never silently rewritten.
create or replace function private.protect_settled_payment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'successful' and (new.status <> 'successful' or new.amount_minor <> old.amount_minor
      or new.paid_amount_minor is distinct from old.paid_amount_minor or new.currency <> old.currency) then
    raise exception 'successful payments are immutable; record a refund or adjustment instead' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger payments_protect_settled before update on public.payments
  for each row execute function private.protect_settled_payment();
create trigger payments_no_delete before delete on public.payments
  for each row execute function private.audit_is_append_only();

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  dedupe_key text not null,
  event_type text not null,
  provider_transaction_id text,
  reference text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  attempts integer not null default 0,
  last_error text,
  tenant_id uuid references public.tenants (id) on delete restrict, -- resolved server-side from the payment
  payment_id uuid references public.payments (id) on delete restrict,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, dedupe_key)
);
create index payment_events_backlog_idx on public.payment_events (status, received_at) where status in ('received', 'failed');

-- Applies a provider-verified result to a payment and its order, atomically
-- and idempotently. Callers pass values from the provider's VERIFY API, never
-- from a webhook body or redirect. Returns the outcome for logging.
create or replace function public.apply_verified_payment(
  p_reference text, p_provider_transaction_id text, p_status text,
  p_amount_minor bigint, p_currency text, p_failure_reason text default null
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_pay public.payments;
  v_order public.orders;
begin
  select * into v_pay from public.payments where reference = p_reference for update;
  if not found then return 'unknown_reference'; end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;

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

    if v_order.payment_status not in ('paid', 'partially_refunded', 'refunded') then
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
    if v_order.payment_status in ('unpaid', 'pending') then
      update public.orders set payment_status = 'failed' where id = v_order.id;
    end if;
    perform private.audit(v_pay.tenant_id, 'payment.failed', 'payment', v_pay.reference,
      jsonb_build_object('status', p_status, 'reason', p_failure_reason));
    return 'failed_recorded';
  end if;

  -- Still pending at the provider.
  update public.payments set status = 'pending',
    provider_transaction_id = coalesce(p_provider_transaction_id, provider_transaction_id) where id = v_pay.id;
  if v_order.payment_status in ('unpaid', 'failed') then
    update public.orders set payment_status = 'pending' where id = v_order.id;
  end if;
  return 'pending';
end $$;
revoke all on function public.apply_verified_payment(text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.apply_verified_payment(text, text, text, bigint, text, text) to service_role;

-- Offline payment (bank transfer, cash, a Paystack/Flutterwave payment link)
-- recorded by staff. Permission-checked in the database and audited.
-- Phase 2 adds maker-checker approval for this.
create or replace function private.record_manual_payment(
  p_order_number text, p_amount_minor bigint, p_currency text, p_method text, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_expected bigint;
  v_id uuid;
  v_ref text := 'MAN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
begin
  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found or not private.has_permission(v_order.tenant_id, 'payments.record') then
    raise exception 'order not found or not permitted' using errcode = '42501';
  end if;
  if v_order.payment_status in ('paid', 'partially_refunded', 'refunded') then
    raise exception 'order is already paid' using errcode = 'P0001', hint = 'order_transition';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'order is cancelled' using errcode = 'P0001', hint = 'order_transition';
  end if;
  if p_method not in ('bank_transfer', 'cash', 'payment_link', 'other') then
    raise exception 'invalid payment method' using errcode = '22023';
  end if;
  if p_note is null or length(trim(p_note)) < 3 then
    raise exception 'a note describing the payment is required' using errcode = '22023';
  end if;
  v_expected := round(v_order.total * power(10, private.currency_exponent(v_order.currency)))::bigint;
  if p_currency <> v_order.currency or p_amount_minor <> v_expected then
    raise exception 'amount must equal the order total (% %)', v_order.currency, v_order.total using errcode = '22023';
  end if;

  insert into public.payments (tenant_id, order_id, provider, reference, amount_minor, currency, status,
                               paid_amount_minor, paid_currency, method, recorded_by, failure_reason, verified_at)
  values (v_order.tenant_id, v_order.id, 'manual', v_ref, p_amount_minor, p_currency, 'successful',
          p_amount_minor, p_currency, p_method, (select auth.uid()), null, now())
  returning id into v_id;

  update public.orders set payment_status = 'paid',
    status = case when status = 'pending_payment' then 'confirmed' else status end
   where id = v_order.id;
  perform private.audit(v_order.tenant_id, 'payment.recorded_manually', 'payment', v_ref,
    jsonb_build_object('order', v_order.order_number, 'amount_minor', p_amount_minor, 'currency', p_currency,
                       'method', p_method, 'note', left(p_note, 500)));
  return v_id;
end $$;

create or replace function public.record_manual_payment(
  p_order_number text, p_amount_minor bigint, p_currency text, p_method text, p_note text
) returns uuid language sql security invoker set search_path = '' as $$
  select private.record_manual_payment(p_order_number, p_amount_minor, p_currency, p_method, p_note)
$$;
revoke all on function public.record_manual_payment(text, bigint, text, text, text) from public, anon;
grant execute on function public.record_manual_payment(text, bigint, text, text, text) to authenticated;

-- ============================================================================
-- 8. Integration configuration (no secrets stored here)
-- ============================================================================
create table public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null check (provider in ('flutterwave')),
  environment text not null check (environment in ('test', 'live')),
  is_active boolean not null default true,
  config jsonb not null default '{}',
  -- Where the secret lives, e.g. 'env:FLW_SECRET_KEY'. Never the secret itself.
  secret_ref text check (secret_ref ~ '^(env|vault):[A-Za-z0-9_]+$'),
  webhook_secret_ref text check (webhook_secret_ref ~ '^(env|vault):[A-Za-z0-9_]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, environment)
);
create trigger integration_configs_touch before update on public.integration_configs
  for each row execute function private.touch_updated_at();
insert into public.integration_configs (tenant_id, provider, environment, secret_ref, webhook_secret_ref)
  select tenant_id, 'flutterwave', 'live', 'env:FLW_SECRET_KEY', 'env:FLW_SECRET_HASH' from default_scope;

-- ============================================================================
-- 9. Rate limiting (fixed window, shared across serverless instances)
-- ============================================================================
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);
grant select, insert, update, delete on private.rate_limits to service_role;

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limits (key, window_start) values (p_key, v_window)
  on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ============================================================================
-- 10. Privileges and RLS
-- ============================================================================
revoke all on table public.tenants, public.stores, public.platform_admins, public.permissions, public.roles,
  public.role_permissions, public.memberships, public.membership_roles, public.audit_events,
  public.order_status_transitions, public.order_events, public.payments, public.payment_events,
  public.integration_configs from anon, authenticated;

grant all on table public.tenants, public.stores, public.platform_admins, public.permissions, public.roles,
  public.role_permissions, public.memberships, public.membership_roles, public.audit_events,
  public.order_status_transitions, public.order_events, public.payments, public.payment_events,
  public.integration_configs to service_role;

alter table public.tenants enable row level security;
alter table public.stores enable row level security;
alter table public.platform_admins enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_roles enable row level security;
alter table public.audit_events enable row level security;
alter table public.order_status_transitions enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.integration_configs enable row level security;

grant select on public.tenants, public.stores, public.permissions, public.roles, public.role_permissions,
  public.memberships, public.membership_roles, public.order_status_transitions to authenticated;
grant select on public.stores to anon;
grant select on public.audit_events, public.order_events, public.payments to authenticated;
grant select, insert, update, delete on public.integration_configs to authenticated;
grant insert, update, delete on public.memberships to authenticated;
grant insert, delete on public.membership_roles to authenticated;
grant insert, update, delete on public.roles, public.role_permissions to authenticated;

create policy "Members read their tenants" on public.tenants for select to authenticated
  using (id in (select private.member_tenants()));
create policy "Anyone reads active stores" on public.stores for select to anon, authenticated
  using (status = 'active');
create policy "Platform admins read the platform admin list" on public.platform_admins for select to authenticated
  using ((select private.is_platform_admin()));
create policy "Authenticated users read the permission catalogue" on public.permissions for select to authenticated
  using (true);
create policy "Read system roles and own-tenant roles" on public.roles for select to authenticated
  using (tenant_id is null or tenant_id in (select private.member_tenants()));
create policy "Manage own-tenant custom roles" on public.roles for all to authenticated
  using (tenant_id in (select private.permitted_tenants('users.manage')))
  with check (tenant_id in (select private.permitted_tenants('users.manage')));
create policy "Read permissions of visible roles" on public.role_permissions for select to authenticated
  using (role_id in (select id from public.roles));
create policy "Manage permissions of own-tenant custom roles" on public.role_permissions for all to authenticated
  using (role_id in (select id from public.roles where tenant_id in (select private.permitted_tenants('users.manage'))))
  with check (role_id in (select id from public.roles where tenant_id in (select private.permitted_tenants('users.manage'))));
create policy "Users read own memberships; managers read tenant memberships" on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or tenant_id in (select private.permitted_tenants('users.manage')));
create policy "Managers invite members to their tenant" on public.memberships for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('users.manage')) and user_id <> (select auth.uid()));
create policy "Managers update members they outrank" on public.memberships for update to authenticated
  using ((select private.can_manage_membership(id)))
  with check ((select private.can_manage_membership(id)));
create policy "Managers remove members they outrank" on public.memberships for delete to authenticated
  using ((select private.can_manage_membership(id)));
create policy "Read role assignments of visible memberships" on public.membership_roles for select to authenticated
  using (membership_id in (select id from public.memberships));
create policy "Managers assign roles they hold" on public.membership_roles for insert to authenticated
  with check ((select private.can_assign_role(membership_id, role_id)));
create policy "Managers unassign roles from members they outrank" on public.membership_roles for delete to authenticated
  using ((select private.can_manage_membership(membership_id)));
create policy "Audit readers see their tenant's audit log" on public.audit_events for select to authenticated
  using (tenant_id in (select private.permitted_tenants('audit.read')));
create policy "Platform admins see platform-level audit events" on public.audit_events for select to authenticated
  using (tenant_id is null and (select private.is_platform_admin()));
create policy "Authenticated users read the transition policy" on public.order_status_transitions for select to authenticated
  using (true);
create policy "Order readers see order history" on public.order_events for select to authenticated
  using (tenant_id in (select private.permitted_tenants('orders.read')));
create policy "Payment readers see payments" on public.payments for select to authenticated
  using (tenant_id in (select private.permitted_tenants('payments.read')));
create policy "Settings managers manage integrations" on public.integration_configs for all to authenticated
  using (tenant_id in (select private.permitted_tenants('settings.manage')))
  with check (tenant_id in (select private.permitted_tenants('settings.manage')));
-- payment_events: no authenticated access at all; service role only.

-- Existing tables: replace the admin-role policies with per-tenant permissions.
drop policy if exists "Admins can read all products" on public.products;
drop policy if exists "Admins can insert products" on public.products;
drop policy if exists "Admins can update products" on public.products;
drop policy if exists "Admins can delete products" on public.products;
drop policy if exists "Admins can read all drops" on public.drops;
drop policy if exists "Admins can insert drops" on public.drops;
drop policy if exists "Admins can update drops" on public.drops;
drop policy if exists "Admins can delete drops" on public.drops;
drop policy if exists "Admins can read orders" on public.orders;
drop policy if exists "Admins can update orders" on public.orders;
drop policy if exists "Admins can read subscribers" on public.newsletter_subscribers;

create policy "Staff read their tenant's products" on public.products for select to authenticated
  using (tenant_id in (select private.permitted_tenants('products.read')));
create policy "Catalogue writers insert products" on public.products for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Catalogue writers update products" on public.products for update to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')))
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Catalogue writers delete products" on public.products for delete to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')));

create policy "Staff read their tenant's drops" on public.drops for select to authenticated
  using (tenant_id in (select private.permitted_tenants('products.read')));
create policy "Catalogue writers insert drops" on public.drops for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Catalogue writers update drops" on public.drops for update to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')))
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Catalogue writers delete drops" on public.drops for delete to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')));

create policy "Order readers see their tenant's orders" on public.orders for select to authenticated
  using (tenant_id in (select private.permitted_tenants('orders.read')));
create policy "Order updaters change their tenant's orders" on public.orders for update to authenticated
  using (tenant_id in (select private.permitted_tenants('orders.update')))
  with check (tenant_id in (select private.permitted_tenants('orders.update')));

create policy "Customer readers see subscribers" on public.newsletter_subscribers for select to authenticated
  using (tenant_id in (select private.permitted_tenants('customers.read')));

-- Staff may change fulfilment status only. Payment status, totals, items and
-- addresses change only through server-side functions.
revoke update on public.orders from authenticated;
grant update (status, tracking_number) on public.orders to authenticated;

-- Function privileges, set once at the end so nothing created above is left
-- with the default PUBLIC execute grant.
revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function
  private.permitted_tenants(text), private.has_permission(uuid, text), private.member_tenants(),
  private.is_platform_admin(), private.can_manage_membership(uuid), private.can_assign_role(uuid, uuid),
  private.record_manual_payment(text, bigint, text, text, text)
  to authenticated, service_role;
grant execute on function private.audit(uuid, text, text, text, jsonb), private.currency_exponent(text),
  private.current_actor_type() to service_role;

commit;
