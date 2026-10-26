-- A free gift with orders.
--
-- The store's gift category holds the pieces a customer may pick one of, free,
-- once their order reaches gift_min_subtotal (0 = every order). Gift pieces
-- never show in the store: public reads skip the category, like a hidden one.
-- Checkout never sells them as normal lines; it adds the chosen one at no
-- charge, and it is taken from stock like any line when the order is paid.
-- gift_category null = no gift. Staff with settings.manage change both.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.stores
  add column gift_category text check (gift_category is null or length(gift_category) between 1 and 60),
  add column gift_min_subtotal numeric(12,2) not null default 0 check (gift_min_subtotal >= 0);

grant update (gift_category, gift_min_subtotal) on public.stores to authenticated;

drop policy if exists "Public can read active, unhidden products" on public.products;
create policy "Public can read active, unhidden products" on public.products
  for select to anon, authenticated
  using (
    status = 'active'
    and not exists (
      select 1 from public.stores s
       where s.id = products.store_id
         and (products.category = any (s.hidden_categories) or products.category = s.gift_category))
  );

-- Final Heaven gives a pendant with every order (decision 26 Oct 2026).
update public.stores set gift_category = 'Gifts' where slug = 'final-heaven';

commit;
