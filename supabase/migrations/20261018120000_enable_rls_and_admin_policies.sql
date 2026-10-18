-- Lock down every public table with row level security.
--
-- Access model
--   anon / authenticated  read active products and published drops, nothing else
--   admins                full access (users whose app_metadata.role = 'admin')
--   service_role          server-only key; places orders, tracks orders, newsletter
--
-- Orders and newsletter_subscribers have NO public policies: customers never read
-- or write them directly. The server validates input and uses the service key.
--
-- Admin role: app_metadata is only writable with the service key, never by the
-- user (unlike user_metadata). To make someone an admin, run as postgres:
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'
--    where email = 'owner@example.com';
-- The user must sign out and in again for the role to appear in their JWT.

-- All or nothing, and never queue behind long-running queries: enabling RLS
-- takes a brief ACCESS EXCLUSIVE lock on each table.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.products               enable row level security;
alter table public.drops                  enable row level security;
alter table public.orders                 enable row level security;
alter table public.newsletter_subscribers enable row level security;

-- Table privileges. Supabase no longer exposes new tables to the Data API
-- automatically (enforced from 2026-10-30), so grant exactly what is needed.
revoke all on table public.products, public.drops, public.orders, public.newsletter_subscribers
  from anon, authenticated;

grant select                         on table public.products, public.drops   to anon, authenticated;
grant insert, update, delete         on table public.products, public.drops   to authenticated;
grant select, update                 on table public.orders                   to authenticated;
grant select                         on table public.newsletter_subscribers   to authenticated;
grant all on table public.products, public.drops, public.orders, public.newsletter_subscribers
  to service_role;

-- The admin check is inlined in each policy; (select auth.jwt()) is evaluated
-- once per statement rather than once per row.

-- products ------------------------------------------------------------------
drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products" on public.products
  for select to anon, authenticated
  using ( status = 'active' );

drop policy if exists "Admins can read all products" on public.products;
create policy "Admins can read all products" on public.products
  for select to authenticated
  using ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products" on public.products
  for insert to authenticated
  with check ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products" on public.products
  for update to authenticated
  using      ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' )
  with check ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products" on public.products
  for delete to authenticated
  using ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

-- drops ---------------------------------------------------------------------
drop policy if exists "Public can read published drops" on public.drops;
create policy "Public can read published drops" on public.drops
  for select to anon, authenticated
  using ( status = 'published' );

drop policy if exists "Admins can read all drops" on public.drops;
create policy "Admins can read all drops" on public.drops
  for select to authenticated
  using ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

drop policy if exists "Admins can insert drops" on public.drops;
create policy "Admins can insert drops" on public.drops
  for insert to authenticated
  with check ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

drop policy if exists "Admins can update drops" on public.drops;
create policy "Admins can update drops" on public.drops
  for update to authenticated
  using      ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' )
  with check ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

drop policy if exists "Admins can delete drops" on public.drops;
create policy "Admins can delete drops" on public.drops
  for delete to authenticated
  using ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

-- orders (admin read + status updates; creation happens server-side) ---------
drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders" on public.orders
  for select to authenticated
  using ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders" on public.orders
  for update to authenticated
  using      ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' )
  with check ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

-- newsletter_subscribers (admin read only; sign-ups happen server-side) -----
drop policy if exists "Admins can read subscribers" on public.newsletter_subscribers;
create policy "Admins can read subscribers" on public.newsletter_subscribers
  for select to authenticated
  using ( ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin' );

commit;
