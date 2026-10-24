-- Product photos uploaded from the admin.
--
-- Photos used to be embedded in products.images as data: URLs, which made
-- rows hundreds of KB, slowed the catalogue and broke admin saves. Uploads
-- now go to this bucket through /api/admin/uploads (products.write, service
-- key), so no storage policy lets signed-in users write here directly. The
-- bucket is public-read because the photos are shown in the store.
-- Skipped where there is no storage schema (the PGlite test database).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 1500000, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $$;
