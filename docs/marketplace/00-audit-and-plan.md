# Final Heaven Market: audit and plan

Audit of 26 Oct 2026, before the marketplace work. Next.js 14.2 (App Router), TypeScript, Tailwind,
Supabase (Postgres + RLS + Storage), Flutterwave, Vercel. Branch `phase-1-foundation`, pushed to
`master` after each approved change.

**Business model (owner's correction, 26 Oct):** new products only. Final Heaven is not a thrift or
second-hand store. Products come from wholesale suppliers, local manufacturers, authorised
distributors, independent labels and Final Heaven's own designs, sold from stock, made to order, or
on pre-order. Nothing second-hand-specific is built.

## Baseline

- `npm run typecheck`, `npm run lint` (only `<img>` warnings), `npm run build` and `npm test` all pass.
  The tests are unit tests plus database tests against the real migrations in PGlite.
- Catalogue: 56 products, all active; 10 are hidden free-gift pendants.

## What already works (kept)

| Area | How it works |
|---|---|
| Checkout | `lib/checkout`: the server prices every cart from the catalogue (never the browser), checks stock, release dates, pauses, promo codes and the free gift. Payments open only from the launch day (none is set yet). |
| Payments | Flutterwave. An Order exists only after a verified payment (`docs/adr/0001`); webhook and verify are idempotent (`orders.checkout_id` unique, `payment_events`). |
| Stock | Taken once per order by the `order_stock` trigger when it's paid; shortfalls are recorded; cancellations put stock back. |
| Discovery feed | Homepage "For you": server-ranked batches (`/api/feed`), no repeats, campaign tiles, local interest profile, no account needed. |
| Shop | `/shop`: search, categories, filters and sort, all held in the URL. |
| Admin | Products, orders, drops, promo codes, customers, analytics, suppliers, store switches; RLS plus route permission checks. |

## Done in this round

| # | Change | Where |
|---|---|---|
| 1 | Product source (original, wholesale, distributor, local maker, independent label), supply (in stock, or made to order with a lead time), label, SKU | `20261026120000_marketplace_catalogue.sql`, `lib/collections.ts` |
| 2 | Review before sale (staff-only): a listing marked "needs review" or "refused" can't be put on sale, enforced in the database | same migration; `lib/sourcing.ts`; product editor |
| 3 | Staff-only sourcing: stock on order and expected date, supplier lead time, image permission, landed-cost parts with the recorded exchange rate; landed cost and gross margin in the editor | `lib/landed-cost.ts`, `SourcingFields` |
| 4 | Labels (brands) and collections (hand-picked and/or rule-based), public once published, admin pages | `/admin/brands`, `/admin/collections`, `/brands/[slug]`, `/collections` |
| 5 | Homepage: shorter hero, Shop by mood, Final Heaven Originals, Labels, Upcoming drops (each hidden when there's nothing real to show) | `app/page.tsx`, `components/home` |
| 6 | Shop: "From" (Originals / Labels / Curated) and "Ready to ship" filters; cards and pages say "Made to order" and "Last one" only when true | `ShopView`, `ProductCard`, `ProductView` |
| 7 | Made to order disclosed on cart, checkout, the order, tracking, the admin and the receipt | `lib/checkout/pricing.ts` and the pages |
| 8 | Checkout holds: the last pieces can't be sold twice (30-minute hold, row locks) | `20261026130000_checkout_holds.sql` |
| 9 | SEO: server-rendered product metadata, Open Graph, schema.org Product (new condition, real availability, no ratings), sitemap, robots | `app/product/[id]/page.tsx`, `app/sitemap.ts`, `app/robots.ts` |
| 10 | Deleting a product that's on orders archives it instead | `app/api/admin/products` |

## Deploy order (must be followed)

1. Apply `20261026120000_marketplace_catalogue.sql`, then `20261026130000_checkout_holds.sql`
   (dry-run each first, with their own `begin`/`commit` stripped).
2. Then deploy the code: it reads the new columns and saves checkouts through `open_checkout`.

## Still to do

| Priority | Item |
|---|---|
| High | Per-size (variant) stock: one stock number still covers every size |
| High | Browser checks of the new pages against real data (blocked until the migrations are applied) |
| Medium | Categories managed in the admin (today: free text plus a suggested list; new categories work without code changes) |
| Medium | Supplier catalogue import into draft products, with review "needs review" by default |
| Medium | Shop paging on the server once the catalogue passes a few hundred products |
| Low | Consignment or partner settlement (not needed while everything is bought or made for us) |

## Decisions needed from the owner

- **Iced Ghost Pendant:** it reproduces the Scream "Ghostface" mask. Under the IP rules it should be
  marked "needs review" (which takes it off sale) or removed. It went live on 26 Oct by the owner's
  decision, and I haven't changed it.
- **Gift pendants and grillz:** generic designs; no issue found.
