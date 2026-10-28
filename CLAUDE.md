# Final Heaven

Streetwear store at https://www.finalheaven.shop. Built with Next.js 14, Supabase and Flutterwave, deployed on Vercel. The production branch is `master`.

## Audit

Project details for the ship-audit skill.

### Where things are

- **Live:** https://www.finalheaven.shop
- **Local:** `npm run build && npx next start -p 3000`.
  - `.env.local` points at the **production** Supabase project, so a local run is read-only.
  - Never POST to `/api/orders`, `/api/payments/*` or admin write routes locally.
  - Checkout and payment refusals are covered by `tests/unit/checkout.test.ts` and `tests/db/`.
- **Tests:** `npm run typecheck`, `npm run lint` (the only warnings are about `<img>` in the admin pages, from before this file), and `npx vitest run`. The database tests run in PGlite and touch nothing live.
- **Database, read-only:** `PGOPTIONS="-c default_transaction_read_only=on" psql "$SUPABASE_CONNECTION_STRING"`.
- **Migrations:**
  - Use `node scripts/db-migrate.mjs`:
    - `status` shows which migrations are live;
    - `preflight` fails if the code needs one that isn't;
    - `apply <file>` checks preconditions, rehearses in a rolled-back transaction, applies, then confirms with a probe.
  - Every new migration needs a probe in that script.
  - Run `preflight` before every push.
  - The files carry their own `begin;`/`commit;`. Strip them before a hand-made `begin; … rollback;` dry run, or the dry run really applies the migration.
  - Apply a migration before deploying the code that reads it, except where the script marks it "after deploy", like the staff MFA lock.
- **Vercel logs:** the project is on a different Vercel account from this machine's CLI, so `vercel logs` can't reach it. Ask the user to check the dashboard if logs are needed.

### Money path

The quote endpoint is `POST /api/checkout/quote` with `{ "items": [{ "id", "size", "color", "quantity" }] }`. Colours and sizes must match the product's own spelling.

Reference cart (₦84,000 on 27 Oct 2026):

| Product | Option | Qty | Price |
|---|---|---|---|
| Heart Pendant Set — All 10 (`p1793045689436`) | `Black` (or `Red`) | 1 | ₦25,000 |
| Long-Stem Rose Tank (`p1792844704816`) | size `M`, colour `black` (lower case) | 2 | ₦17,000 each |
| Iced Ghost Pendant (`p1793042411004`) | `Gold` (or `Silver`) | 1 | ₦25,000 |

Refusals to try:
- a colour the product doesn't have;
- a size the product doesn't have;
- an unknown product id;
- a quantity over 20;
- an option over 160 characters;
- a `price` field in the request (it must be ignored).

Checkout is closed until `stores.payments_open_on` is set. Launch is planned for November 2026; the public date is kept vague ("November").

The shipping split (contribution, recovery, reserve, platform share) is internal: the quote response must never contain it, and checkout totals must not change because of it. See `docs/erp/06-shipping.md`.

### Browser checks

Run the scripts in `scripts/audit/` (they need Chrome; analytics are blocked while they run). In Git Bash, prefix them with `MSYS_NO_PATHCONV=1`.

- `node scripts/audit/pagecheck.mjs <base> <outdir> / /shop /collections /product/p1793045689436 /cart` checks phone and desktop: console errors, broken images, sideways scroll and JSON-LD, with screenshots.
- `node scripts/audit/gallerycheck.mjs <base> <outdir> p1793045689436` checks that a swipe on the product photos changes the colour, that tapping a colour brings its photo back, and that off-screen animations pause on the homepage.
- `node scripts/audit/netlog.mjs <url>` reports what a page downloads, against the budget in the skill.

### Unauthenticated routes that must refuse

- `/api/admin/*` returns 401.
- `/admin` returns 307 (redirect to login).

### Marketing files

- Social packs are in `brand/social/`; videos in `brand/social/video/` (see `november-plan.md`).
- Prices in them must match the live store on the day.
- The videos promise only that checkout opens in November (no day): it must open in November. Announce the day separately once `payments_open_on` is set.
