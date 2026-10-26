# Final Heaven Market: audit and plan

Audit of 26 Oct 2026, before the marketplace work. Next.js 14.2 (App Router), TypeScript, Tailwind,
Supabase (Postgres + RLS + Storage), Flutterwave, Vercel. Branch `phase-1-foundation`, pushed to
`master` after each approved change.

## Baseline

- `npm run typecheck`, `npm run lint` (only `<img>` warnings), `npm run build`, `npm test`: all pass
  (240 tests: unit tests, plus database tests against the real migrations in PGlite).
- Git: clean apart from untracked `.mcp.json`, `.codex/`, `brand/print/` (not ours to commit).
- Catalogue: 56 products, all active; 10 are hidden free-gift pendants.

## What already works (keep it)

| Area | How it works today |
|---|---|
| Checkout | `lib/checkout`: the server prices every cart from the catalogue (never the browser), checks stock, release dates, pauses, promo codes, the free gift. Payments open only from the launch day (none is set yet). |
| Payments | Flutterwave. An Order exists only after a verified payment (`docs/adr/0001`); webhook and verify are idempotent (`orders.checkout_id` unique, `payment_events`). |
| Stock | Taken when the order is paid, by the `order_stock` trigger, once per order; shortfalls are recorded for staff, and cancellations put stock back. |
| Discovery feed | Homepage "For you": server-ranked batches (`/api/feed`, `lib/discovery`), no repeats, campaign tiles between products, local interest profile, no account needed. |
| Shop | `/shop`: search, category chips, size/colour/price/stock filters, sort; URL-driven. Filters run in the browser over at most 500 products. |
| Admin | Products (with sourcing), orders, drops, promo codes, customers, analytics, suppliers, store switches; permissions enforced by RLS and route checks. |
| Images | Local WebP copies (640/1200) and admin uploads to Storage with a 640 copy. |

## Gaps against the directive

1. **Product model:** no source type (original / thrift / wholesale / independent / consignment), condition, condition notes, brand or SKU.
2. **Collections and brands:** there are none; the homepage can't show "shop by mood" or partner labels.
3. **Overselling one-of-ones:** stock is only taken after payment. Two shoppers can pay for the last
   piece at the same time; the second order is recorded as "stock short" and needs a refund.
   Thrift needs a hold at checkout.
4. **Per-size stock:** one stock number covers every size, so one size can oversell.
5. **Landed cost and margin:** sourcing records one unit cost; there's no shipping, customs, prep, FX rate or margin.
6. **Consignment terms:** suppliers have no ownership model or commission.
7. **SEO:** the product page renders in the browser only (no per-product title, description,
   Open Graph or structured data); there's no sitemap or robots file; the site title says "Urban Streetwear".
8. **Shop scale:** filtering in the browser is fine up to a few hundred products; it needs server paging beyond that.
9. **Admin delete:** products are hard-deleted (orders keep their own copy of each line, so history survives, but archiving is safer).
10. **Review flag:** listings sourced from third parties have no "needs review" step before publishing.

## Plan, in order

| # | Phase | Status |
|---|---|---|
| 1 | Product model: source, condition, notes, brand, SKU; brands; collections (migration, RLS, tests) | in progress |
| 2 | Storefront: collection pages, homepage sections (latest drop, shop by mood, originals, labels), shop filters for source/condition/brand, product page details | to do |
| 3 | SEO: server-rendered product metadata, Open Graph, JSON-LD, sitemap, robots, site title | to do |
| 4 | Inventory integrity: checkout holds for the last pieces, per-size stock | to do |
| 5 | Admin: new product fields, collections and brands editors, landed cost and margin, consignment terms, archive instead of delete | to do |
| 6 | Shop at scale: server-side filtering and paging | to do |
| 7 | Full regression: tests, browser on phone and desktop, security review | to do |

## Decisions needed from the owner

- **Third-party designs:** the Iced Ghost Pendant reproduces the Scream "Ghostface" mask. The
  directive's sourcing rules (section 8) say not to sell unauthorised protected designs; it went live
  on 26 Oct by the owner's decision. Keep or unpublish?
- **Real photos for thrift:** store photos so far are generated studio shots of factory products.
  One-of-one thrift pieces need real photos of the actual item.
