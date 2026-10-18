# Analytics, customers and compliance

Added 18 October 2026. Migration `20261018140000_analytics_customers_compliance.sql`, applied to the live database the same day after a dry run.

## Analytics: KPI definitions

All figures are for the tenant's own data, computed in the database (`analytics_summary`) from orders and anonymous visit events. Days are calendar days in the tenant's time zone (Africa/Lagos for Final Heaven). Access requires `analytics.read`, and only aggregates are returned.

| KPI | Definition |
| --- | --- |
| Gross sales | Sum of `orders.total` for orders **placed** in the period whose `payment_status` is `paid`, `partially_refunded` or `refunded`. Before refunds. |
| Paid orders | Count of those orders. |
| Orders placed | All orders created in the period, any status. |
| Average order value | Gross sales ÷ paid orders. |
| Awaiting payment | Orders placed in the period still in `pending_payment` (count and value). Not sales. |
| Unverified (legacy) | Orders with `payment_status = 'unverified'`: paid outside the system before 18 Oct 2026. Shown separately, never counted as sales. |
| Paid rate | Paid orders ÷ orders placed, same period. |
| Paying, new and returning customers | Distinct lower-cased emails with a paid order in the period. New: their first ever paid order falls in the period. Returning: two or more paid orders in total. |
| Top products | By revenue (`price × quantity` from `order_items`) across paid orders in the period. |
| To fulfil, in transit, awaiting payment now | Current counts (not period-bound) of orders in `confirmed`/`processing`, `shipped`, and `pending_payment`. |

Not yet available: refunds and net sales (Phase 2), processor fees and settlements (Phase 4).

## Visitor analytics: first-party for admin, Vercel alongside

**Admin → Analytics is the client's analytics and must stay self-contained.** Vercel Web Analytics is dashboard-only (no query API; only panel CSV exports and Drains), so it can't feed admin. Both run:

| | First-party tracker | Vercel Web Analytics |
| --- | --- | --- |
| Who sees it | The store owner, in Admin → Analytics | The developer, in the Vercel dashboard |
| Code | `/api/track`, `PageViewTracker`, `track_event`, `analytics_events` | `<VercelAnalytics />` (`@vercel/analytics/next`) |
| Page views | `PageViewTracker` on every storefront navigation | automatic |
| Shopping steps | `lib/analytics.ts` sends `product_view`, `add_to_cart`, `checkout_started` to both | custom events; **stored on Pro plans only** |

Both are cookieless and skip Do Not Track and Global Privacy Control visitors, staff pages, login and unsubscribe. The first-party tracker works the way described below.

### First-party tracker (privacy)

- **No cookies, no browser storage.** The browser sends the path (query string removed after reading UTM tags), the referrer and an optional product ID.
- **Hashing:** the server hashes `IP | user agent` with a random salt that changes daily (`private.analytics_salts`). Salts older than a day are deleted by the daily job, so codes can't be linked across days or reversed. The IP address and user agent are never stored.
- **Not counted:** known bots as well.
- **Stored per event:** the event type, path, product ID, referring host, UTM source, medium and campaign, device class and country (from Vercel's edge header; empty locally).

### Vercel Web Analytics

- Enable Web Analytics in the Vercel project; it collects only on Vercel deployments (in development it logs to the console).
- **Privacy filter (`beforeSend`):** drops visitors with Do Not Track or Global Privacy Control; never sends `/admin`, `/login` or `/unsubscribe`; strips every query parameter except `utm_source`, `utm_medium` and `utm_campaign` (addresses here can carry payment references, order numbers or unsubscribe tokens). Verified in the browser.
- **CSP:** production loads from `/_vercel/insights` (same origin); the dev debug script host `va.vercel-scripts.com` is allowed in development only.
- **Install note:** `.npmrc` sets `legacy-peer-deps=true`. `@vercel/analytics` lists SvelteKit as an optional peer and npm 11 fails trying to reconcile it with Vitest's Vite. No Svelte package is installed; a clean `npm ci` was verified.
- **Do not remove the first-party tracker** in favour of Vercel: admin would lose visitors, conversion, funnel, sources and devices.

## Customers

`/admin/customers` lists one row per customer email (lower-cased) from orders: order count, paid count and total, first and last order, latest city. Expanding a row shows that customer's orders with status and courier tracking. Requires `customers.read`. It's derived from orders until Phase 2 adds a `customers` table; nothing is merged automatically.

Orders now carry `shipping_carrier` and `shipping_reference`, set by staff with `orders.update` and shown to the customer on Track Order. `/admin/orders` has search (order number, tracking or email) and status and payment filters, and accepts them as URL parameters (`?status=shipped`).

## Retention (daily job `/api/cron/daily`)

| Data | Kept | Mechanism |
| --- | --- | --- |
| Orders, payments, payment events, order events, audit log | Not deleted by any job. Privacy policy states 6 years for tax and accounting. **Confirm the period with your accountant.** | n/a |
| Analytics events | 13 months | `run_retention()` |
| Analytics salts | 1 day | `run_retention()` |
| Rate-limit windows | 2 days | `run_retention()` |
| Newsletter subscribers | Until unsubscribe (`unsubscribed_at` set) | `/unsubscribe?token=…` |

The job is idempotent and safe to re-run. It never touches financial records. The test suite checks this.

## Compliance changes

| Area | Change |
| --- | --- |
| Misleading claims (FCCPA) | Removed fake "verified" reviews, star ratings and admin-entered "sold" counts; removed "Free shipping over $50", "International shipping", "30-day returns" and "Free returns for US customers" from product pages; replaced the fake membership sign-up and prices with an honest waitlist; removed "members shop 24h early" claims from the home page; removed the "Size Guide" link to a page that didn't exist. |
| Policy pages | Terms of Sale, Privacy Policy (NDPA 2023), Returns & Refunds, Shipping, Contact, all driven by `lib/legal.ts`. |
| Checkout | Required (not pre-ticked) agreement to Terms and Returns; the terms version and time are stored on the order. Country is fixed to Nigeria and enforced by the server. |
| Marketing consent | Explicit opt-in tick-box; the exact consent wording and time are stored per subscriber; re-subscribing refreshes consent; token-based unsubscribe (a button, so email link scanners can't trigger it). |
| Vapes | Hidden pending legal review via `stores.hidden_categories`: invisible to the public (RLS), not purchasable (checkout), still manageable in admin. Undo: `update public.stores set hidden_categories = '{}' where slug = 'final-heaven';` |

## Owner decisions (18 Oct 2026)

7-day change-of-mind returns; the customer pays change-of-mind return delivery; Nigeria-only delivery; vapes hidden until legal review.

## Before launch: still needed from you

Adjusted for a start-up (18 Oct 2026). Business details in `lib/legal.ts` are optional: pages mention each one only once it's set, and customers reach you through the **contact form** (Admin → Messages) until you publish an email or phone. Nothing shows as missing.

Still worth doing:
- **Register the business name with the CAC** when you can. Trading under a name generally requires it in Nigeria. Then add the name and BN/RC number to `lib/legal.ts`.
- Add a support email when you have one (it then appears next to the contact form).
- Confirm the defaults I set: **5 business days** to issue refunds and **7 days** to report faulty or damaged items or non-delivery
- Have a Nigerian lawyer review the Terms, Privacy Policy and the vape question (age restriction and advertising rules for nicotine products)
- Confirm the 6-year record retention with your accountant
- Add delivery charges and typical delivery times to the Shipping page once decided (checkout currently charges none)
