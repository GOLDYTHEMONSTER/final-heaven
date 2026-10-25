-- The staff reference link now lives in product_sources (staff-only); the
-- column on products was readable with the public key. Apply after the code
-- that stopped reading and writing it is live.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into public.product_sources (product_id, tenant_id, listing_url)
select id, tenant_id, product_url from public.products where product_url is not null
on conflict (product_id) do update set listing_url = coalesce(public.product_sources.listing_url, excluded.listing_url);

alter table public.products drop column product_url;

commit;
