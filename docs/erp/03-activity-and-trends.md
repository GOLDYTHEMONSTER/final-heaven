# Live activity and trends

Migration: `supabase/migrations/20261018170000_activity_feed.sql`. Tests: `tests/db/activity-feed.test.ts` and `tests/db/trends.test.ts`.

## What staff see

- **Bell (header).** Shows an unread count, with a panel of the last 40 events. Opening the panel marks them seen, for that person only.
- **Toasts.** Pop up bottom-right when something happens while admin is open. Hovering pauses them; clicking goes to the record.
- **Tab title.** Shows `(3) …` when there are unread events, so a background tab still signals.
- **Desktop alerts.** Optional, switched on in the bell panel. They fire only when the admin tab is in the background.
- **Nav badges.**
  - Orders shows how many orders are waiting to be fulfilled (confirmed or processing).
  - Messages shows how many messages are still open.
  - A badge turns ember when something new has arrived there.
- **"New" chip.** Marks orders that arrived while the Orders page was open.
- **Connection status.** "Live" means Realtime is connected. "Every 20s" means it has fallen back to polling. A quiet feed is never mistaken for a broken one.
- **Pages refresh themselves** when relevant activity lands:
  - Orders, Messages and Customers.
  - The Analytics figures.
  - Each page's trend tiles.

## Events recorded

Database triggers write each event as the change commits, whichever path made the change: checkout, webhook, staff or cron.

| Event | When | Visible to |
|---|---|---|
| New order | order inserted | `orders.read` |
| Payment received | payment status becomes paid | `orders.read` |
| Payment failed | payment status becomes failed | `payments.read` |
| Order cancelled | status becomes cancelled | `orders.read` |
| New message | contact form message | `customers.read` |
| New subscriber | newsletter sign-up or re-subscribe | `customers.read` |
| Low stock / sold out | an active product drops to 3 or fewer | `products.read` |

- **Who sees what:** RLS shows each event only to staff holding its permission in that tenant.
- **Writes:** nobody can write to the feed directly.
- **Retention:** 90 days, via `run_retention`. The audit log is separate and is never pruned.

## How live updates work

1. Supabase Realtime streams new `activity_feed` rows. RLS is applied per subscriber.
2. The browser treats each event only as a nudge and refetches `/api/admin/activity`. Data therefore always arrives through the permission-checked API.
3. Polling backs this up: every 20 s if Realtime is unavailable, otherwise every 2 min. It also refreshes when the tab regains focus.

## Trends

`business_trends(tenant, days)` compares the last 7, 30 or 90 store-local days with the period before. The comparison shows the direction with an arrow and words. Ember is used only when the change is for the worse.

| Page | Tiles |
|---|---|
| Orders | orders placed, paid sales, average paid order, orders shipped, payment-to-shipping time, cancelled |
| Customers | new customers (first order this period), returning customers, repeat rate, newsletter sign-ups |
| Messages | received, handled, response time, open now |

Sections are returned only to staff holding the matching permission:
- Sales and fulfilment: `orders.read`.
- Customers and messages: `customers.read`.

"Paid" means the same here as in the analytics summary.

## Deploying

The code tolerates the migration not being applied yet. In that state:
- The bell says "Activity isn't switched on yet".
- The trend tiles say they will appear after the database update.

Apply the migration to switch both on.
