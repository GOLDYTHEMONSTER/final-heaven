-- Two tables on the product page, instead of facts buried in the description:
--   specs       a list of { label, value } rows ("Connector": "USB Type-C").
--   size_chart  { unit?, headers: [...], rows: [[...], ...] }, first column the size.
-- Both are read by the public storefront with the rest of the product row
-- (anon already has select on products), and written through the admin products
-- API or brand/catalog's add-product script. Shapes and sizes are checked here
-- as well as in lib/product-tables.ts, so a bad write can't reach a page.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.products
  add column specs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(specs) = 'array' and jsonb_array_length(specs) <= 30 and pg_column_size(specs) < 8192),
  add column size_chart jsonb
    check (
      size_chart is null or (
        jsonb_typeof(size_chart) = 'object'
        and jsonb_typeof(size_chart -> 'headers') = 'array'
        and jsonb_typeof(size_chart -> 'rows') = 'array'
        and jsonb_array_length(size_chart -> 'headers') between 2 and 8
        and jsonb_array_length(size_chart -> 'rows') between 1 and 20
        and pg_column_size(size_chart) < 8192
      )
    );

comment on column public.products.specs is 'Spec table rows shown on the product page: [{"label": "...", "value": "..."}].';
comment on column public.products.size_chart is 'Size table shown on the product page: {"unit": "cm", "headers": ["Size", ...], "rows": [["M", ...], ...]}.';

commit;
