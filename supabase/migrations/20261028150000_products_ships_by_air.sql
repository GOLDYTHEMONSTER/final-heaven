-- Products that can't go by air (lithium batteries: power banks and the like).
-- Off means sea freight only: an order holding one can't choose Express, since
-- an order travels together (lib/delivery.ts expressAvailable). Default on, so
-- every existing product keeps Express.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.products add column ships_by_air boolean not null default true;
comment on column public.products.ships_by_air is 'False: sea freight only (no Express by air), e.g. items with lithium batteries.';

commit;
