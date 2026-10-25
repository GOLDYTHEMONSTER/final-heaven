-- Suppliers and where each product is sourced from.
--
-- Staff-only. Columns on products are readable with the public key (the
-- storefront's read policy), so sourcing never lives there: the old
-- products.product_url ("staff reference link") is copied into
-- product_sources here and dropped after the code stops using it
-- (20261025100100_drop_product_url.sql).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  platform text check (platform is null or length(platform) <= 40),
  url text check (url is null or length(url) <= 2000),
  contact text check (contact is null or length(contact) <= 300),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index suppliers_tenant_name_idx on public.suppliers (tenant_id, lower(name));

create table public.product_sources (
  product_id text primary key references public.products (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  listing_url text check (listing_url is null or length(listing_url) <= 2000),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  cost_currency char(3) not null default 'CNY' check (cost_currency ~ '^[A-Z]{3}$'),
  notes text check (notes is null or length(notes) <= 2000),
  updated_at timestamptz not null default now()
);
create index product_sources_supplier_idx on public.product_sources (supplier_id);
create index product_sources_tenant_idx on public.product_sources (tenant_id);

create trigger suppliers_touch before update on public.suppliers for each row execute function private.touch_updated_at();
create trigger product_sources_touch before update on public.product_sources for each row execute function private.touch_updated_at();

alter table public.suppliers enable row level security;
alter table public.product_sources enable row level security;
revoke all on public.suppliers, public.product_sources from anon, authenticated;
grant select, insert, update, delete on public.suppliers, public.product_sources to authenticated;
grant all on public.suppliers, public.product_sources to service_role;

create policy "Product readers see suppliers" on public.suppliers
  for select to authenticated using (tenant_id in (select private.permitted_tenants('products.read')));
create policy "Product writers add suppliers" on public.suppliers
  for insert to authenticated with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers edit suppliers" on public.suppliers
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')))
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers remove suppliers" on public.suppliers
  for delete to authenticated using (tenant_id in (select private.permitted_tenants('products.write')));

create policy "Product readers see product sources" on public.product_sources
  for select to authenticated using (tenant_id in (select private.permitted_tenants('products.read')));
create policy "Product writers add product sources" on public.product_sources
  for insert to authenticated with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers edit product sources" on public.product_sources
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('products.write')))
  with check (tenant_id in (select private.permitted_tenants('products.write')));
create policy "Product writers remove product sources" on public.product_sources
  for delete to authenticated using (tenant_id in (select private.permitted_tenants('products.write')));

-- Keep the one existing staff reference link.
insert into public.product_sources (product_id, tenant_id, listing_url)
select id, tenant_id, product_url from public.products where product_url is not null
on conflict (product_id) do nothing;

commit;
