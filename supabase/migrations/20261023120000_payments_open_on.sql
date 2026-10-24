-- Online payment opens on the store's launch day.
--
-- Until payments_open_on is set, checkout takes no payments: the storefront
-- still shows, prices and carts everything. From that day (in the store's
-- time zone) checkout opens on its own, with no deploy.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.stores add column payments_open_on date;
comment on column public.stores.payments_open_on is
  'Launch day: checkout takes payments from this date (store time zone). Null = not yet.';

commit;
