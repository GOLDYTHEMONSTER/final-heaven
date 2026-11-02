-- Event tickets (docs/erp/08-events.md).
--
-- An event has paid ticket tiers, each with a capacity. Buying works like the
-- shop (docs/adr/0001): a ticket checkout holds its seats for 30 minutes and
-- is paid through Flutterwave; apply_verified_payment issues the tickets in
-- the same transaction that records the verified payment. Tickets are never
-- created before payment.
--
-- Each ticket has a secret token (its QR code opens /t/<token>) and a short
-- code to type at the door when a scan fails. Checking in happens once:
-- public.door_ticket locks the ticket and refuses a second time. Door staff
-- are either Studio staff with events.checkin, or helpers holding a door link
-- for one event, which expires and can be revoked.
--
-- Everything a buyer touches is written by the server (service role) through
-- these functions. Staff read and manage through RLS, with events.manage.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ----------------------------------------------------------------------------
-- 1. Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('events.manage',  'Create and edit events and ticket tiers, see ticket sales and attendees, make door links'),
  ('events.checkin', 'Check tickets in at the door');

insert into public.role_permissions (role_id, permission_key)
select r.id, x.perm
  from public.roles r
  join (values
    ('owner', 'events.manage'), ('owner', 'events.checkin'),
    ('administrator', 'events.manage'), ('administrator', 'events.checkin'),
    ('sales_manager', 'events.checkin'), ('customer_support', 'events.checkin'), ('fulfilment_staff', 'events.checkin')
  ) as x (role, perm) on r.key = x.role
 where r.tenant_id is null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2. Events and ticket tiers
-- ----------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  store_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  title text not null check (length(title) between 1 and 120),
  description text not null default '' check (length(description) <= 4000),
  venue text not null default '' check (length(venue) <= 200),
  address text not null default '' check (length(address) <= 300),
  image_url text check (image_url is null or (length(image_url) <= 500 and image_url ~ '^(https://|/)')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- Sales run from sales_open_at (null: as soon as it's published) to
  -- sales_close_at (null: when the event starts). Separate from the shop's launch day.
  sales_open_at timestamptz,
  sales_close_at timestamptz,
  sales_paused boolean not null default false,
  max_per_order smallint not null default 6 check (max_per_order between 1 and 20),
  terms text not null default '' check (length(terms) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id),
  unique (store_id, slug),
  unique (tenant_id, id),
  check (ends_at is null or ends_at > starts_at),
  check (sales_open_at is null or sales_close_at is null or sales_close_at > sales_open_at)
);
create index events_tenant_idx on public.events (tenant_id, starts_at desc);
create trigger events_touch before update on public.events for each row execute function private.touch_updated_at();
create trigger events_tenant_immutable before update on public.events for each row execute function private.prevent_tenant_change();

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid not null,
  name text not null check (length(name) between 1 and 60),
  description text not null default '' check (length(description) <= 300),
  -- ₦100 is the smallest amount charged online (lib/checkout).
  price numeric(10,2) not null check (price >= 100),
  capacity integer not null check (capacity between 1 and 100000),
  sort smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete cascade,
  unique (tenant_id, id)
);
create index ticket_types_event_idx on public.ticket_types (event_id, sort);
create trigger ticket_types_touch before update on public.ticket_types for each row execute function private.touch_updated_at();
create trigger ticket_types_tenant_immutable before update on public.ticket_types for each row execute function private.prevent_tenant_change();

-- ----------------------------------------------------------------------------
-- 3. Ticket checkouts, orders and tickets
-- ----------------------------------------------------------------------------
create table public.ticket_checkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid not null,
  reference text not null unique check (reference ~ '^[A-Z0-9-]{8,40}$'),
  -- Assigned now, used only when the tickets are issued; never shown before.
  order_number text not null unique check (order_number ~ '^FHT-[0-9A-Z]{6}$'),
  email text not null check (length(email) between 3 and 254),
  name text not null check (length(name) between 1 and 120),
  phone text check (phone is null or length(phone) <= 30),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  -- [{ ticket_type_id, name, quantity, unit_price }]
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 10),
  subtotal numeric(10,2) not null check (subtotal > 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  total numeric(10,2) not null check (total >= 100),
  promo_code_id uuid references public.promo_codes (id) on delete restrict,
  promo_code text,
  terms_accepted_at timestamptz not null,
  hold_until timestamptz,
  status text not null default 'open' check (status in ('open', 'completed', 'expired')),
  ticket_order_id uuid unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete restrict,
  check (total = subtotal - discount)
);
create index ticket_checkouts_holds_idx on public.ticket_checkouts (event_id, hold_until) where status = 'open' and ticket_order_id is null;

create table public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid not null,
  checkout_id uuid not null unique references public.ticket_checkouts (id) on delete restrict,
  order_number text not null unique,
  -- Opens the buyer's tickets page (/tickets/<token>), sent in the ticket email.
  access_token text not null unique default replace(gen_random_uuid()::text, '-', '') check (access_token ~ '^[0-9a-f]{32}$'),
  email text not null,
  name text not null,
  phone text,
  currency char(3) not null,
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  promo_code_id uuid references public.promo_codes (id) on delete restrict,
  promo_code text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  payment_status text not null default 'paid' check (payment_status in ('paid', 'refunded')),
  -- Set when it was paid for after its tier filled up, or for a cancelled
  -- event: { "<ticket type id>": seats over capacity, "event_cancelled": true }. Staff refund or honour it.
  capacity_shortfall jsonb,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete restrict,
  unique (tenant_id, id)
);
create index ticket_orders_event_idx on public.ticket_orders (event_id, created_at desc);
create trigger ticket_orders_touch before update on public.ticket_orders for each row execute function private.touch_updated_at();
alter table public.ticket_checkouts add foreign key (ticket_order_id) references public.ticket_orders (id) on delete restrict;

create table public.event_door_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid not null,
  label text not null check (length(label) between 1 and 60),
  -- SHA-256 of the secret in the link. The secret itself is shown once, when the link is made.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  checkins integer not null default 0,
  last_used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete cascade
);
create index event_door_links_event_idx on public.event_door_links (event_id, created_at desc);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid not null,
  ticket_order_id uuid not null,
  ticket_type_id uuid not null,
  -- In the ticket's QR code (/t/<token>).
  token text not null unique default replace(gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{32}$'),
  -- Typed at the door when a scan fails; shown as "K7M 42Q". Same alphabet as SpanPlug's receipt codes.
  code text not null check (code ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{6}$'),
  status text not null default 'valid' check (status in ('valid', 'checked_in', 'void')),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users (id) on delete set null,
  checked_in_door uuid references public.event_door_links (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete restrict,
  foreign key (tenant_id, ticket_order_id) references public.ticket_orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, ticket_type_id) references public.ticket_types (tenant_id, id) on delete restrict,
  unique (event_id, code),
  check (status <> 'checked_in' or checked_in_at is not null)
);
create index tickets_order_idx on public.tickets (ticket_order_id);
create index tickets_type_idx on public.tickets (ticket_type_id) where status <> 'void';

-- ----------------------------------------------------------------------------
-- 4. Payments can pay for a ticket checkout
-- ----------------------------------------------------------------------------
alter table public.payments
  add column ticket_checkout_id uuid references public.ticket_checkouts (id) on delete restrict,
  add column ticket_order_id uuid references public.ticket_orders (id) on delete restrict,
  drop constraint payments_target_check,
  add constraint payments_target_check check (order_id is not null or checkout_id is not null or ticket_checkout_id is not null);
create index payments_ticket_checkout_idx on public.payments (ticket_checkout_id, created_at desc) where ticket_checkout_id is not null;

-- ----------------------------------------------------------------------------
-- 5. Seats: sold, held, free
-- ----------------------------------------------------------------------------
create or replace function private.tickets_sold(p_type uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.tickets where ticket_type_id = p_type and status <> 'void'
$$;

-- Seats of a tier held by live ticket checkouts, except one.
create or replace function private.tickets_held(p_type uuid, p_except uuid default null) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((i ->> 'quantity')::int), 0)::int
    from public.ticket_checkouts c, jsonb_array_elements(c.items) i
   where c.status = 'open' and c.ticket_order_id is null and c.hold_until > now()
     and (p_except is null or c.id <> p_except)
     and i ->> 'ticket_type_id' = p_type::text
$$;

-- What the event page shows: each tier's seats still free.
create or replace function public.ticket_availability(p_event uuid)
returns table (ticket_type_id uuid, capacity integer, sold integer, held integer, free integer)
language sql stable security definer set search_path = '' as $$
  select t.id, t.capacity, s.sold, h.held, greatest(t.capacity - s.sold - h.held, 0)
    from public.ticket_types t
    cross join lateral (select private.tickets_sold(t.id) as sold) s
    cross join lateral (select private.tickets_held(t.id) as held) h
   where t.event_id = p_event
     and ((select auth.jwt() ->> 'role') = 'service_role'
          or private.has_permission(t.tenant_id, 'events.manage') or private.has_permission(t.tenant_id, 'events.checkin'))
$$;

-- A short door code nobody else at this event has. Random bytes from
-- gen_random_uuid (its last six bytes are all random), not random().
create or replace function private.new_ticket_code(p_event uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 10..15 loop
      v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, i) % 31, 1);
    end loop;
    exit when not exists (select 1 from public.tickets where event_id = p_event and code = v_code);
  end loop;
  return v_code;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Opening a ticket checkout (the server, after pricing it)
-- ----------------------------------------------------------------------------
-- Locks each tier (in id order, so two buyers can't deadlock), checks the
-- event is on sale, re-checks every price against the tier and the subtotal
-- against the sum, and checks enough seats are free after everyone else's
-- live holds. Fails with:
--   'event_closed'           not published, cancelled, paused or outside its sale window;
--   'too_many'               more tickets than the event allows per order;
--   'price_changed'          a price differs from the tier's (the page was stale);
--   'held:<ticket type id>'  not enough seats, the seats still free in DETAIL.
-- The same buyer starting again releases their earlier unpaid holds first.
create or replace function public.open_ticket_checkout(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.events;
  v_type public.ticket_types;
  r record;
  v_free integer;
  v_count integer := 0;
  v_subtotal numeric := 0;
  v_id uuid;
begin
  select * into v_event from public.events
   where id = (p ->> 'event_id')::uuid and tenant_id = (p ->> 'tenant_id')::uuid
     for share;
  if not found or v_event.status <> 'published' or v_event.sales_paused
     or (v_event.sales_open_at is not null and v_event.sales_open_at > now())
     or now() >= coalesce(v_event.sales_close_at, v_event.starts_at) then
    raise exception 'event_closed';
  end if;

  update public.ticket_checkouts set hold_until = null
   where event_id = v_event.id and lower(email) = lower(p ->> 'email')
     and status = 'open' and ticket_order_id is null and hold_until > now();

  for r in
    select (i ->> 'ticket_type_id')::uuid as id, sum((i ->> 'quantity')::int)::int as qty,
           min((i ->> 'unit_price')::numeric) as low, max((i ->> 'unit_price')::numeric) as high
      from jsonb_array_elements(p -> 'items') i
     group by 1
     order by 1
  loop
    select * into v_type from public.ticket_types where id = r.id and event_id = v_event.id for update;
    if not found or not v_type.active then
      raise exception 'held:%', r.id using detail = '0';
    end if;
    if r.low <> v_type.price or r.high <> v_type.price then
      raise exception 'price_changed';
    end if;
    v_free := v_type.capacity - private.tickets_sold(v_type.id) - private.tickets_held(v_type.id);
    if v_free < r.qty then
      raise exception 'held:%', r.id using detail = greatest(v_free, 0)::text;
    end if;
    v_count := v_count + r.qty;
    v_subtotal := v_subtotal + v_type.price * r.qty;
  end loop;
  if v_count > v_event.max_per_order then
    raise exception 'too_many';
  end if;
  if v_subtotal <> (p ->> 'subtotal')::numeric then
    raise exception 'price_changed';
  end if;

  insert into public.ticket_checkouts (tenant_id, event_id, reference, order_number, email, name, phone, currency, items,
    subtotal, discount, total, promo_code_id, promo_code, terms_accepted_at, hold_until)
  values (v_event.tenant_id, v_event.id, p ->> 'reference', p ->> 'order_number', p ->> 'email', p ->> 'name', nullif(p ->> 'phone', ''),
    v_event.currency, p -> 'items', v_subtotal, coalesce((p ->> 'discount')::numeric, 0), (p ->> 'total')::numeric,
    nullif(p ->> 'promo_code_id', '')::uuid, nullif(p ->> 'promo_code', ''), (p ->> 'terms_accepted_at')::timestamptz,
    now() + interval '30 minutes')
  returning id into v_id;
  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Issuing tickets, when a payment for a ticket checkout is verified
-- ----------------------------------------------------------------------------
-- Called only by apply_verified_payment. A checkout already issued returns
-- its order unchanged (a second payment for it is refunded by staff).
-- A tier that filled up while this buyer paid still gets its tickets, and the
-- order is flagged (capacity_shortfall) for staff to refund or honour.
create or replace function private.issue_tickets_from_checkout(p_checkout uuid) returns public.ticket_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.ticket_checkouts;
  v_o public.ticket_orders;
  v_event public.events;
  v_type public.ticket_types;
  r record;
  v_short jsonb := '{}';
  v_count integer := 0;
  v_sold integer;
begin
  select * into v_c from public.ticket_checkouts where id = p_checkout for update;
  if not found then
    raise exception 'ticket checkout % not found', p_checkout;
  end if;
  if v_c.ticket_order_id is not null then
    select * into v_o from public.ticket_orders where id = v_c.ticket_order_id;
    return v_o;
  end if;
  select * into v_event from public.events where id = v_c.event_id;

  insert into public.ticket_orders (tenant_id, event_id, checkout_id, order_number, email, name, phone, currency,
    subtotal, discount, total, promo_code_id, promo_code)
  values (v_c.tenant_id, v_c.event_id, v_c.id, v_c.order_number, v_c.email, v_c.name, v_c.phone, v_c.currency,
    v_c.subtotal, v_c.discount, v_c.total, v_c.promo_code_id, v_c.promo_code)
  returning * into v_o;

  for r in
    select (i ->> 'ticket_type_id')::uuid as id, sum((i ->> 'quantity')::int)::int as qty
      from jsonb_array_elements(v_c.items) i
     group by 1
     order by 1
  loop
    select * into v_type from public.ticket_types where id = r.id for update;
    v_sold := private.tickets_sold(r.id);
    if v_sold + r.qty > v_type.capacity then
      v_short := v_short || jsonb_build_object(r.id::text, v_sold + r.qty - v_type.capacity);
    end if;
    for n in 1..r.qty loop
      insert into public.tickets (tenant_id, event_id, ticket_order_id, ticket_type_id, code)
      values (v_c.tenant_id, v_c.event_id, v_o.id, r.id, private.new_ticket_code(v_c.event_id));
    end loop;
    v_count := v_count + r.qty;
  end loop;
  if v_event.status = 'cancelled' then
    v_short := v_short || '{"event_cancelled": true}'::jsonb;
  end if;
  if v_short <> '{}'::jsonb then
    update public.ticket_orders set capacity_shortfall = v_short where id = v_o.id returning * into v_o;
  end if;

  update public.ticket_checkouts set status = 'completed', ticket_order_id = v_o.id, completed_at = now(), hold_until = null
   where id = v_c.id;
  insert into public.email_outbox (tenant_id, kind, ticket_order_id, dedupe_key)
  values (v_c.tenant_id, 'tickets.issued', v_o.id, 'tickets.issued:' || v_o.id)
  on conflict (dedupe_key) do nothing;
  perform private.post_activity(v_c.tenant_id, 'tickets.sold',
    v_count || case when v_count = 1 then ' ticket' else ' tickets' end || ' sold for ' || v_event.title,
    private.money_label(v_c.total, v_c.currency)
      || case when v_event.status = 'cancelled' then ' · event is cancelled, refund needed'
              when v_short <> '{}'::jsonb then ' · over capacity, refund or honour it'
              else '' end,
    '/admin/events/' || v_event.id, 'events.manage');
  return v_o;
end $$;

-- apply_verified_payment (20261018190000_orders_after_payment.sql), with one
-- addition: a payment for a ticket checkout issues its tickets.
create or replace function public.apply_verified_payment(
  p_reference text, p_provider_transaction_id text, p_status text,
  p_amount_minor bigint, p_currency text, p_failure_reason text default null
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_pay public.payments;
  v_order public.orders;
  v_tickets public.ticket_orders;
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

    -- A ticket checkout payment issues its tickets now. If they were already
    -- issued by another payment, this one is a second payment to refund.
    if v_pay.ticket_checkout_id is not null then
      v_already_placed := exists (select 1 from public.ticket_checkouts where id = v_pay.ticket_checkout_id and ticket_order_id is not null);
      v_tickets := private.issue_tickets_from_checkout(v_pay.ticket_checkout_id);
      update public.payments set ticket_order_id = v_tickets.id where id = v_pay.id;
      if v_already_placed then
        perform private.audit(v_pay.tenant_id, 'payment.duplicate', 'payment', v_pay.reference,
          jsonb_build_object('ticket_order', v_tickets.order_number, 'amount_minor', p_amount_minor, 'currency', p_currency));
        perform private.post_activity(v_pay.tenant_id, 'payment.received', 'Second payment for ' || v_tickets.order_number,
          private.money_label(p_amount_minor::numeric / power(10, private.currency_exponent(p_currency))::numeric, p_currency)
            || ' · already paid, refund this one', '/admin/events/' || v_tickets.event_id, 'payments.read');
        return 'duplicate_payment';
      end if;
      perform private.audit(v_pay.tenant_id, 'payment.succeeded', 'payment', v_pay.reference,
        jsonb_build_object('ticket_order', v_tickets.order_number, 'amount_minor', p_amount_minor, 'currency', p_currency,
          'overpaid_minor', p_amount_minor - v_pay.amount_minor));
      return 'applied';
    end if;

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
-- 8. The door: look a ticket up, check it in once
-- ----------------------------------------------------------------------------
-- p_ref is a ticket's token (from its QR code) or its door code (typed; the
-- event must be known). Two callers:
--   * Studio staff (authenticated, events.checkin in the ticket's tenant);
--   * a door link: the server (service role) checked the helper's cookie and
--     passes the link, which must still be live; it decides the event.
-- A ticket the caller can't see answers 'not_found', like one that doesn't exist.
-- Outcomes: valid | checked_in | already | void | not_found | door_closed.
create or replace function public.door_ticket(p_ref text, p_event uuid default null, p_door uuid default null, p_check_in boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_service boolean := (select auth.jwt() ->> 'role') = 'service_role';
  v_link public.event_door_links;
  v_ticket public.tickets;
  v_event uuid := p_event;
  v_ref text := lower(regexp_replace(coalesce(p_ref, ''), '[^0-9A-Za-z]', '', 'g'));
  v_outcome text;
  v_info jsonb;
begin
  if p_door is not null then
    if not v_service then
      raise exception 'Not permitted.' using errcode = '42501';
    end if;
    select * into v_link from public.event_door_links where id = p_door;
    if not found or v_link.revoked_at is not null or v_link.expires_at <= now() then
      return jsonb_build_object('outcome', 'door_closed');
    end if;
    if v_event is not null and v_event <> v_link.event_id then
      return jsonb_build_object('outcome', 'not_found');
    end if;
    v_event := v_link.event_id;
  elsif v_service then
    raise exception 'A door link is needed.' using errcode = '42501';
  end if;

  if v_ref ~ '^[0-9a-f]{32}$' then
    select * into v_ticket from public.tickets where token = v_ref and (v_event is null or event_id = v_event) for update;
  elsif v_ref ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{6}$' and v_event is not null then
    select * into v_ticket from public.tickets where event_id = v_event and code = v_ref for update;
  end if;
  if v_ticket.id is null or (not v_service and not private.has_permission(v_ticket.tenant_id, 'events.checkin')) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  v_outcome := case v_ticket.status when 'void' then 'void' when 'checked_in' then 'already' else 'valid' end;
  if p_check_in and v_ticket.status = 'valid' then
    update public.tickets
       set status = 'checked_in', checked_in_at = now(),
           checked_in_by = case when v_service then null else (select auth.uid()) end,
           checked_in_door = v_link.id
     where id = v_ticket.id
    returning * into v_ticket;
    v_outcome := 'checked_in';
  end if;
  if v_link.id is not null then
    update public.event_door_links
       set last_used_at = now(), checkins = checkins + case when v_outcome = 'checked_in' then 1 else 0 end
     where id = v_link.id;
  end if;

  select jsonb_build_object(
           'id', v_ticket.id, 'code', v_ticket.code, 'status', v_ticket.status, 'checkedInAt', v_ticket.checked_in_at,
           'type', tt.name, 'name', o.name, 'orderNumber', o.order_number, 'orderStatus', o.status,
           'eventId', e.id, 'event', e.title, 'startsAt', e.starts_at)
    into v_info
    from public.ticket_orders o, public.ticket_types tt, public.events e
   where o.id = v_ticket.ticket_order_id and tt.id = v_ticket.ticket_type_id and e.id = v_ticket.event_id;
  return jsonb_build_object('outcome', v_outcome, 'ticket', v_info);
end $$;

-- A check-in made by mistake, undone by a manager.
create or replace function public.undo_check_in(p_ticket uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.tickets;
begin
  select * into v_ticket from public.tickets where id = p_ticket for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  perform private.require(v_ticket.tenant_id, 'events.manage');
  if v_ticket.status <> 'checked_in' then
    return;
  end if;
  update public.tickets set status = 'valid', checked_in_at = null, checked_in_by = null, checked_in_door = null where id = p_ticket;
  perform private.audit(v_ticket.tenant_id, 'ticket.check_in_undone', 'ticket', v_ticket.code, jsonb_build_object('ticket', p_ticket));
end $$;

-- Cancels a ticket order: its tickets stop working at the door. p_refunded
-- records that the money was refunded (in the Flutterwave dashboard).
create or replace function public.cancel_ticket_order(p_order uuid, p_reason text, p_refunded boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.ticket_orders;
begin
  select * into v_order from public.ticket_orders where id = p_order for update;
  if not found then
    raise exception 'ticket order not found' using errcode = 'P0002';
  end if;
  perform private.require(v_order.tenant_id, 'events.manage');
  if p_refunded then
    perform private.require(v_order.tenant_id, 'refunds.approve');
  end if;
  update public.ticket_orders
     set status = 'cancelled', cancel_reason = left(nullif(trim(p_reason), ''), 300),
         cancelled_by = coalesce(cancelled_by, (select auth.uid())), cancelled_at = coalesce(cancelled_at, now()),
         payment_status = case when p_refunded then 'refunded' else payment_status end
   where id = p_order;
  update public.tickets set status = 'void' where ticket_order_id = p_order and status <> 'void';
  perform private.audit(v_order.tenant_id, 'ticket_order.cancelled', 'ticket_order', v_order.order_number,
    jsonb_build_object('reason', p_reason, 'refunded', p_refunded));
end $$;

-- Unpaid ticket checkouts lose their personal details after 30 days, like shop checkouts.
create or replace function public.run_ticket_retention() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update public.ticket_checkouts set status = 'expired', email = 'removed@invalid', name = 'removed', phone = null
   where ticket_order_id is null and created_at < now() - interval '30 days' and email <> 'removed@invalid';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ----------------------------------------------------------------------------
-- 9. The ticket email and the activity feed
-- ----------------------------------------------------------------------------
alter table public.email_outbox add column ticket_order_id uuid references public.ticket_orders (id) on delete cascade;
alter table public.email_outbox drop constraint email_outbox_one_reference;
alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_one_reference check (num_nonnulls(order_id, message_id, subscriber_id, alert_id, reply_id, ticket_order_id) = 1),
  add constraint email_outbox_kind_check check (kind in (
    'order.paid', 'order.shipped', 'staff.order_paid', 'staff.message', 'subscriber.welcome', 'product.available', 'order.followup',
    'order.delivered', 'order.refunded', 'support.ack', 'support.reply', 'tickets.issued'));

alter table public.activity_feed drop constraint activity_feed_kind_check;
alter table public.activity_feed add constraint activity_feed_kind_check check (kind in (
  'order.placed', 'payment.received', 'payment.failed', 'order.cancelled',
  'message.received', 'subscriber.new', 'stock.low', 'tickets.sold'));

-- ----------------------------------------------------------------------------
-- 10. Access
-- ----------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.ticket_checkouts enable row level security;
alter table public.ticket_orders enable row level security;
alter table public.tickets enable row level security;
alter table public.event_door_links enable row level security;

revoke all on public.events, public.ticket_types, public.ticket_checkouts, public.ticket_orders, public.tickets,
  public.event_door_links from anon, authenticated;
grant select, insert, update, delete on public.events, public.ticket_types to authenticated;
grant select, insert, update on public.event_door_links to authenticated;
grant select on public.ticket_checkouts, public.ticket_orders, public.tickets to authenticated;
grant all on public.events, public.ticket_types, public.ticket_checkouts, public.ticket_orders, public.tickets,
  public.event_door_links to service_role;

create policy "Event staff read events" on public.events for select to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage'))
         or tenant_id in (select private.permitted_tenants('events.checkin')));
create policy "Event managers add events" on public.events for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('events.manage')));
create policy "Event managers edit events" on public.events for update to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')))
  with check (tenant_id in (select private.permitted_tenants('events.manage')));
-- Only drafts; an event with checkouts is kept by its foreign keys anyway.
create policy "Event managers delete draft events" on public.events for delete to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')) and status = 'draft');

create policy "Event staff read tiers" on public.ticket_types for select to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage'))
         or tenant_id in (select private.permitted_tenants('events.checkin')));
create policy "Event managers add tiers" on public.ticket_types for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('events.manage')));
create policy "Event managers edit tiers" on public.ticket_types for update to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')))
  with check (tenant_id in (select private.permitted_tenants('events.manage')));
create policy "Event managers delete tiers" on public.ticket_types for delete to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')));

create policy "Event managers read ticket checkouts" on public.ticket_checkouts for select to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')));
create policy "Event managers read ticket orders" on public.ticket_orders for select to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')));
create policy "Event managers read tickets" on public.tickets for select to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')));

create policy "Event managers read door links" on public.event_door_links for select to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')));
create policy "Event managers add door links" on public.event_door_links for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('events.manage')) and created_by = (select auth.uid()));
create policy "Event managers revoke door links" on public.event_door_links for update to authenticated
  using (tenant_id in (select private.permitted_tenants('events.manage')))
  with check (tenant_id in (select private.permitted_tenants('events.manage')));

revoke all on function public.open_ticket_checkout(jsonb), public.run_ticket_retention() from public, anon, authenticated;
grant execute on function public.open_ticket_checkout(jsonb), public.run_ticket_retention() to service_role;
revoke all on function public.ticket_availability(uuid), public.door_ticket(text, uuid, uuid, boolean),
  public.undo_check_in(uuid), public.cancel_ticket_order(uuid, text, boolean) from public, anon;
grant execute on function public.ticket_availability(uuid), public.door_ticket(text, uuid, uuid, boolean),
  public.undo_check_in(uuid), public.cancel_ticket_order(uuid, text, boolean) to authenticated, service_role;

revoke all on all functions in schema private from public, anon;
revoke all on function private.issue_tickets_from_checkout(uuid), private.new_ticket_code(uuid),
  private.tickets_sold(uuid), private.tickets_held(uuid, uuid) from authenticated;
-- apply_verified_payment and open_ticket_checkout run as the service role and use these.
grant execute on function private.issue_tickets_from_checkout(uuid), private.new_ticket_code(uuid),
  private.tickets_sold(uuid), private.tickets_held(uuid, uuid) to service_role;

commit;
