# 08 · Events and tickets

Paid tickets for Final Heaven events, starting with the launch event. Buying works like the shop: same Flutterwave account and the same verify, webhook and reconciliation path. Ideas taken from the owner's other projects:

- **CinePass:** one row per ticket with its own QR token; a check-in function that refuses a second scan and anyone who isn't door staff.
- **SpanPlug:** the QR code opens a page on the site (`/t/<token>`) rather than needing an app; a 6-character code from an alphabet without look-alikes (`abcdefghjkmnpqrstuvwxyz23456789`) for typing at the door; a ticket you can't see looks exactly like one that doesn't exist.

Code: `lib/events/` (rules in `index.ts`, database in `store.ts`, the door in `door.ts`). Data: `supabase/migrations/20261102100000_event_tickets.sql`. Tests: `tests/unit/events.test.ts`, `tests/db/event-tickets.test.ts`, `tests/unit/tickets-email.test.ts`.

## How a sale works

0. **Browse** `/events` (in the site menu): upcoming events as cards, with date, place, the lowest price and On sale / Sold out / Soon. The latest past nights are listed below them.
1. **Event page** `/events/<slug>`: a scroll-through tunnel of photos, then one card per tier, then the buyer's name, phone and email (all three required: the tickets go to the email, the phone is kept to reach them) and an optional waitlist code. The price shown comes from `POST /api/events/<slug>/quote`.
2. **Checkout** `POST /api/events/<slug>/checkout`:
   - the server prices the order again;
   - `open_ticket_checkout` locks each tier and re-checks prices, the sale window, the per-order limit and free seats;
   - the seats are held for 30 minutes and the Flutterwave payment starts for exactly that total.
3. **Payment.** `apply_verified_payment` sees the payment's `ticket_checkout_id` and issues the tickets in the same transaction (`issue_tickets_from_checkout`): one ticket per seat, each with a token and a code. It also:
   - queues the ticket email;
   - posts "N tickets sold" to the Studio bell.
4. **Return** `/events/complete`. It verifies with Flutterwave, as `/checkout/complete` does. The tickets page link is returned only together with the email the tickets were bought with, which the browser kept from step 1.
5. **Ticket email.** Automatic service mail (`tickets.issued`):
   - one email per order, whatever the number of tickets;
   - a PNG QR code for each ticket (`/api/tickets/<token>/qr`);
   - its door code;
   - a button to `/tickets/<access token>`.

Like shop orders (ADR 0001), no ticket exists before a verified payment.

| Case | What happens |
|---|---|
| Two buyers want the last seat | The second gets "Only N left" when they start checkout, not after paying. |
| A buyer starts again (e.g. back from Flutterwave) | Their earlier unpaid hold is released first, so they don't block themselves. |
| Payment confirmed after the hold expired and the tier filled | The tickets are still issued. The order gets `capacity_shortfall`, shows "To check" in Studio, and staff refund it or let them in. |
| Payment lands after the event was cancelled | Same flag, `event_cancelled`. |
| A second payment for the same checkout | No new tickets. It's reported as a duplicate to refund, as in the shop. |

## Sale window

- Each event has its own window, separate from `stores.payments_open_on`, so tickets can sell before shop checkout opens.
- Sales run from `sales_open_at` (empty: as soon as it's published) to `sales_close_at` (empty: when the event starts).
- Sales stop while:
  - the event is paused (`sales_paused`);
  - the store is paused (`stores.purchases_paused`);
  - the event is a draft or cancelled.

## Waitlist discount

- **Which codes:** only a subscriber's personal early access code (lib/early-access). Shop promo codes are refused on tickets.
- **Whose email:** the subscriber's own.
- **How much:** their current percent (25%, plus invite credits, up to 35%).
- **Which tickets:** at most 2 per order, the dearest ones, so nobody can buy discounted tickets in bulk to resell.
- **How often:** once on tickets, counted on paid ticket orders. It doesn't use up the code's first-order discount in the shop.
- **Until:** the code's own end, 30 days after launch day.
- **Floor:** an order never goes below ₦100.

These are the defaults chosen when the feature was built. Change them in `TICKETS` and `ticketDiscount`, in `lib/events/index.ts`.

## The door

- **Scanning.** The QR code holds `https://www.finalheaven.shop/t/<token>`. Any phone camera opens it; there's no app.
  - On a door phone, the page shows the name, the tier and a big **Check in** button.
  - On anyone else's phone, it shows the ticket itself, so a guest can show it from a forwarded link.
- **Typing a code.** On `/door`, type the 6-character code under the QR.
- **Checking in.** `door_ticket` locks the ticket, so it works once. A second scan shows "Already used at 8:14 pm". A cancelled order's tickets show as cancelled.
- **Who can check in:**
  - **Studio staff with `events.checkin`.** Owner, administrator, sales manager, customer support and fulfilment staff have it; `events.manage` is for owner and administrator. They scan while signed in, or open `/door?event=<id>` (the **Open the door** button).
  - **Door links, for helpers without accounts.** Made in Studio → Events → the event → Door links:
    - each link works for that one event only;
    - it expires 12 hours after the event by default;
    - it can be revoked, which stops it on the phone's next scan.
    - The link and its QR code are shown once. Only a SHA-256 of the secret is stored.
    - Opening it leaves an httpOnly cookie on that phone until it expires.
- **Undo.** A check-in made by mistake can be undone by `events.manage` (`undo_check_in`).

## Studio

- **Studio → Events** lists the events, with tickets sold, checked in and the money taken.
- **Each event's page** has:
  - publish, pause, cancel, and delete (draft only);
  - tiers (name, price, capacity, on sale);
  - details;
  - guests, searchable by name, email or code;
  - door links.
- **Cancelling a ticket order** voids its tickets at once. Refunds are made in the Flutterwave dashboard. Recording one ("Cancel and record refund") needs `refunds.approve`.
- **Cancelling an event** stops sales. Each order is refunded one by one.

## Email budget

- **The ticket email** is service mail: automatic, sent first, never held.
- **Quota:** each order uses 1 email, and there's no per-sale staff email; sales show in the Studio bell and as a "Tickets sold" line in the daily digest.
- **Busy on-sale days:** the free Resend plan is 100 emails a day. A busy day can push some ticket emails to the next day.
  - Nothing is lost: the buyer goes straight from Flutterwave to their tickets page.
  - Still, move to a paid Resend plan before a big on-sale.

## Privacy and retention

- `/t/`, `/tickets/`, `/door` and `/events/complete` are noindex and disallowed in robots. Event pages stay crawlable, with schema.org `Event` data.
- Unpaid ticket checkouts lose their name, email and phone after 30 days (`run_ticket_retention`, in the daily job's retention step).
- Ticket orders are financial records and are kept.

## Not built yet

- Transferring a ticket to another name.
- Free RSVP tiers.
- Seat maps.
- Wallet passes.
- Exporting the guest list.
- Refunds through the Flutterwave API (they're made in the dashboard today).
- Events in the sitemap.
