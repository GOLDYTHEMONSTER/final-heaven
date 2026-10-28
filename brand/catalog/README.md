# Adding products

Products go live without a deploy. Each product has a folder here holding its
photos and a `product.json`; `scripts/add-product.mjs` uploads the photos to
Supabase Storage and saves the product. Photos stay out of git (they live in
Storage); `product.json` is the record.

## The workflow

1. **Send the product**: photos, the supplier link, the price you want, and
   anything you know (colours, sizes, stock or pre-order limit, ship time).
2. **Folder**: `brand/catalog/<slug>/` with the photos and a `product.json`
   copied from `_template.json`. Only facts you gave or the listing shows; no
   invented weights, sizes or specs.
3. **Check** (writes nothing): `node scripts/add-product.mjs brand/catalog/<slug>`
   prints what is wrong, what is missing (a colour with no photo, no packed
   weight) and the margin when the cost is known.
4. **Save as a draft**: add `--apply`. Photos upload once; running it again
   updates the same product.
5. **Look it over** in Admin → Products, then put it on sale with `--publish`.

Price changes, stock and on/off switches after that are quicker in Admin.

## product.json

| Field | Meaning |
|---|---|
| `name`, `category`, `description` | As shown in the shop. Categories in use: Accessories, Gadgets, Grillz, Hoodies, Jackets, Ladies, Pendants, Sets, T-Shirts, Tracksuits |
| `price`, `original_price` | Naira. `original_price` only for a sale, and above `price` |
| `stock` | Units you can sell (for items ordered in after payment, the most you'll take) |
| `colors`, `sizes`, `tags` | Spelling of colours must match the `color` on its photos |
| `fulfilment` | `stock` (ships from Nigeria) or `made_to_order` (made or ordered in after payment) |
| `lead_time_days` | Days before it ships, for `made_to_order` |
| `source_type` | `original`, `wholesale` or `distributor` (ordered in from China: offers Express by air), `independent`, `local_maker` |
| `ships_by_air` | `false` for items that can't fly (lithium batteries: power banks): sea freight only, and an order holding one loses Express. Leave it out otherwise |
| `preorder`, `preorder_ships_on`, `preorder_limit` | A dated pre-order |
| `photos` | `[{ "file": "white.jpg", "color": "White" }]`, first is the cover; `url` is filled in on upload |
| `source` | Staff only: `listing_url`, `unit_cost`, `cost_currency` (CNY, USD, NGN), `fx_rate` (₦ per unit), `image_permission`, `notes` |
| `shipping` | Packed weight for Express and freight: `weight_kg`, `packaging_kg`, `length_cm`, `width_cm`, `height_cm`, `data_status` (`estimated` or `verified`) |
| `id` | Filled in on the first `--apply` |
