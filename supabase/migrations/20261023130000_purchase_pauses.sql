-- Pausing purchases from the admin: one product, or the whole store.
--
-- A paused product still shows in the store; nobody can buy it. A paused
-- store takes no payments (like before its launch day, payments_open_on).
-- Checkout reads both on every request, so a pause applies at once. Staff
-- with settings.manage change the store's switches, and nothing else on it.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.products add column purchases_paused boolean not null default false;
alter table public.stores add column purchases_paused boolean not null default false;

grant update (payments_open_on, purchases_paused, updated_at) on public.stores to authenticated;
create policy "Settings managers update their stores" on public.stores for update to authenticated
  using (tenant_id in (select private.permitted_tenants('settings.manage')))
  with check (tenant_id in (select private.permitted_tenants('settings.manage')));

commit;
