-- Marketplace catalogue (new products only): where a product comes from, how
-- it's supplied, its label, its review before publishing, and collections that
-- group products without copying them.
--
--   products.source_type   original | wholesale | independent | distributor | local_maker
--   products.fulfilment    stock (ready to ship) | made_to_order (made after the
--                          order, lead_time_days to make); pre-orders keep their
--                          own columns (preorder, preorder_ships_on)
--   product_sources        staff-only: review status, stock on order, lead time,
--                          image permission, landed-cost parts
--   brands                 independent labels; public once published
--   collections            curated groups ("shop by mood", drops, labels): a
--                          hand-picked list (collection_products) and/or a rule
--                          (category, source, price, tag) applied by the app
--
-- Product columns are public (the storefront reads them), so nothing internal
-- goes here: costs and supplier terms stay in product_sources.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ----------------------------------------------------------------------------
-- Brands
-- ----------------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  description text check (description is null or length(description) <= 600),
  logo_url text check (logo_url is null or length(logo_url) <= 2000),
  website text check (website is null or length(website) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug)
);
create index brands_tenant_idx on public.brands (tenant_id);

-- ----------------------------------------------------------------------------
-- Products: source, how it's supplied, label, SKU
-- ----------------------------------------------------------------------------
alter table public.products
  add column source_type text not null default 'original'
    check (source_type in ('original', 'wholesale', 'independent', 'distributor', 'local_maker')),
  add column fulfilment text not null default 'stock' check (fulfilment in ('stock', 'made_to_order')),
  add column lead_time_days integer check (lead_time_days is null or lead_time_days between 1 and 180),
  add column brand_id uuid references public.brands (id) on delete set null,
  add column sku text check (sku is null or length(sku) between 1 and 60);

-- Made to order always says how long making it takes.
alter table public.products add constraint products_made_to_order_lead_time_check
  check (fulfilment <> 'made_to_order' or lead_time_days is not null);

-- ----------------------------------------------------------------------------
-- Sourcing (staff-only): review before publishing, stock on order, lead time,
-- image permission, and the parts of the landed cost.
-- ----------------------------------------------------------------------------
alter table public.product_sources
  add column review_status text not null default 'not_required'
    check (review_status in ('not_required', 'pending', 'approved', 'rejected')),
  add column review_notes text check (review_notes is null or length(review_notes) <= 2000),
  add column incoming_quantity integer not null default 0 check (incoming_quantity between 0 and 1000000),
  add column incoming_eta date,
  add column supplier_lead_time_days integer check (supplier_lead_time_days is null or supplier_lead_time_days between 0 and 365),
  add column image_permission text not null default 'unknown'
    check (image_permission in ('own', 'supplier_permitted', 'unknown')),
  add column fx_rate numeric(14,6) check (fx_rate is null or fx_rate > 0),
  add column shipping_cost_ngn numeric(12,2) check (shipping_cost_ngn is null or shipping_cost_ngn >= 0),
  add column customs_cost_ngn numeric(12,2) check (customs_cost_ngn is null or customs_cost_ngn >= 0),
  add column other_cost_ngn numeric(12,2) check (other_cost_ngn is null or other_cost_ngn >= 0);

-- A product waiting for (or refused at) review can't be put on sale.
create or replace function private.check_product_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and exists (
    select 1 from public.product_sources s where s.product_id = new.id and s.review_status in ('pending', 'rejected')) then
    raise exception 'review_pending: this product needs its review approved before it goes on sale.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.check_product_review() from public, anon, authenticated;
create trigger products_review_gate before insert or update of status on public.products
  for each row execute function private.check_product_review();

-- And a review can't be reopened on a product that's already on sale: take it off sale first.
create or replace function private.check_source_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.review_status in ('pending', 'rejected') and exists (
    select 1 from public.products p where p.id = new.product_id and p.status = 'active') then
    raise exception 'review_pending: take this product off sale (draft) before marking it for review.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.check_source_review() from public, anon, authenticated;
create trigger product_sources_review_gate before insert or update of review_status on public.product_sources
  for each row execute function private.check_source_review();

create unique index products_store_sku_idx on public.products (store_id, sku) where sku is not null;
create index products_brand_idx on public.products (brand_id) where brand_id is not null;
create index products_source_idx on public.products (store_id, source_type);

-- ----------------------------------------------------------------------------
-- Collections
-- ----------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  description text check (description is null or length(description) <= 600),
  cover_image text check (cover_image is null or length(cover_image) <= 2000),
  -- Optional rule the app applies on top of the hand-picked list (lib/collections).
  rule jsonb check (rule is null or (jsonb_typeof(rule) = 'object' and length(rule::text) <= 2000)),
  status text not null default 'draft' check (status in ('draft', 'published')),
  featured boolean not null default false,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index collections_store_idx on public.collections (store_id, status, sort_order);
create index collections_tenant_idx on public.collections (tenant_id);

create table public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  position integer not null default 0,
  primary key (collection_id, product_id)
);
create index collection_products_product_idx on public.collection_products (product_id);
create index collection_products_tenant_idx on public.collection_products (tenant_id);

create trigger brands_touch before update on public.brands for each row execute function private.touch_updated_at();
create trigger collections_touch before update on public.collections for each row execute function private.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Links stay inside one business: a product's brand, and a collection's
-- products, belong to the same tenant (RLS alone checks only the row's own tenant).
-- ----------------------------------------------------------------------------
create or replace function private.check_catalogue_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'products' then
    if new.brand_id is not null and not exists (
      select 1 from public.brands b where b.id = new.brand_id and b.tenant_id = new.tenant_id) then
      raise exception 'That brand belongs to another business.' using errcode = '23514';
    end if;
  else
    if not exists (select 1 from public.collections c where c.id = new.collection_id and c.tenant_id = new.tenant_id)
       or not exists (select 1 from public.products p where p.id = new.product_id and p.tenant_id = new.tenant_id) then
      raise exception 'A collection can only hold its own business''s products.' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_catalogue_links() from public, anon, authenticated;

create trigger products_brand_tenant before insert or update of brand_id, tenant_id on public.products
  for each row execute function private.check_catalogue_links();
create trigger collection_products_tenant before insert or update on public.collection_products
  for each row execute function private.check_catalogue_links();

-- ----------------------------------------------------------------------------
-- Access: the public reads what's published; staff with products.read see
-- everything for their business; products.write edits.
-- ----------------------------------------------------------------------------
alter table public.brands enable row level security;
alter table public.collections enable row level security;
alter table public.collection_products enable row level security;
revoke all on public.brands, public.collections, public.collection_products from anon, authenticated;
grant select on public.brands, public.collections, public.collection_products to anon, authenticated;
grant insert, update, delete on public.brands, public.collections, public.collection_products to authenticated;
grant all on public.brands, public.collections, public.collection_products to service_role;

create policy "Public reads published brands" on public.brands
  for select to anon, authenticated using (status = 'published');
create policy "Public reads live collections" on public.collections
  for select to anon, authenticated
  using (status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
-- Links of live collections; the products themselves are still filtered by
-- the products read policy (active, not hidden, not gifts).
create policy "Public reads live collection links" on public.collection_products
  for select to anon, authenticated
  using (exists (
    select 1 from public.collections c
     where c.id = collection_products.collection_id and c.status = 'published'
       and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())));

create policy "Product readers see brands" on public.brands
  for select to authenticated using (tenant_id in (select private.permitted_tenants('products.read')));
create policy "Product readers see collections" on public.collections
  for select to authenticated using (tenant_id in (select private.permitted_tenants('products.read')));
create policy "Product readers see collection links" on public.collection_products
  for select to authenticated using (tenant_id in (select private.permitted_tenants('products.read')));

create policy "Product writers add brands" on public.brands
  for insert to authenticated with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers edit brands" on public.brands
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')))
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers remove brands" on public.brands
  for delete to authenticated using (tenant_id in (select private.permitted_tenants('products.write')));

create policy "Product writers add collections" on public.collections
  for insert to authenticated with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers edit collections" on public.collections
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')))
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers remove collections" on public.collections
  for delete to authenticated using (tenant_id in (select private.permitted_tenants('products.write')));

create policy "Product writers add collection links" on public.collection_products
  for insert to authenticated with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers edit collection links" on public.collection_products
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')))
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers remove collection links" on public.collection_products
  for delete to authenticated using (tenant_id in (select private.permitted_tenants('products.write')));

-- ----------------------------------------------------------------------------
-- Final Heaven: everything bought in from suppliers is wholesale; the rest
-- is original merchandise (the column default), including the Drop 01 cap.
-- ----------------------------------------------------------------------------
update public.products p set source_type = 'wholesale'
  from public.stores s
 where s.id = p.store_id and s.slug = 'final-heaven'
   and p.category in ('Accessories', 'Gadgets', 'Grillz', 'Gifts', 'Pendants', 'Vapes')
   and not coalesce(p.tags, '[]'::jsonb) ? 'drop-01';

commit;
