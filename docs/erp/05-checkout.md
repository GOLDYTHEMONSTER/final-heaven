# Checkout: orders exist only after payment

Migration: `supabase/migrations/20261018190000_orders_after_payment.sql`. Code: the Checkout module `lib/checkout/` (`quote`, `begin`, `resume`; Supabase adapter in `supabase-store.ts`), the catalogue rules `lib/catalog.ts`, and the endpoints `app/api/orders`, `app/api/checkout/quote`, `app/api/payments/*`. Tests: `tests/unit/checkout.test.ts` (through the module interface), `tests/unit/checkout-rules.test.ts`, `tests/db/checkout-orders.test.ts`. Decision: `docs/adr/0001-orders-exist-only-after-payment.md`. Terms: `GLOSSARY.md`.

## The flow

1. **Cart.** The browser keeps the cart, but every price, discount and availability check it shows comes from `POST /api/checkout/quote`. That is the same function checkout uses.
2. **Checkout.** `POST /api/orders` re-prices the cart on the server and saves a **checkout**: the items, delivery details, totals and any promo code. It then returns a Flutterwave payment link, and the browser goes straight there.
   - No order exists yet. The customer sees no order number or tracking number, admin shows nothing, and Track Order finds nothing.
   - If Flutterwave isn't configured or can't be reached, nothing is saved as an order and the customer is told nothing was charged.
3. **Payment confirmed.** Whichever arrives first places the order: the customer's return (`/checkout/complete`), the webhook, or the daily reconciliation. `apply_verified_payment` verifies the payment with Flutterwave. Only then, in one transaction, it:
   - creates the order, already paid and confirmed, with the order number and tracking number reserved at checkout;
   - takes the stock, or the pre-order allowance;
   - counts the promo code use;
   - announces "New order" in the admin bell;
   - queues the receipt and the staff alert email.
4. **Customer sees the order.** `/checkout/complete` shows the order number and tracking number and empties the cart. If payment failed, the cart is kept and **Try payment again** reuses the same checkout for up to 24 hours.

Checks that apply whichever path places the order:
- a second payment for the same checkout never creates a second order; it is flagged "refund this one";
- an underpayment or the wrong currency places nothing;
- confirming the same payment twice changes nothing.

## What the server enforces

These rules live in `lib/catalog.ts` (purchase state, shown by the storefront) and inside the Checkout module (`lib/checkout/pricing.ts`), which enforces them at checkout.

| Rule | Behaviour |
|---|---|
| Product inactive or deleted | Can't be bought. |
| Members-only | Can't be bought until membership launches. The page shows "Members only". |
| Release date in the future | Shows "Coming soon" and can't be bought, unless pre-orders are on. Dates are in Lagos time. |
| Pre-order | Customers pay in full now. Each order uses the product's "pre-orders available", up to that number; stock isn't used. The order and its lines are marked pre-order with the ship date. |
| Stock | Quantity can't exceed stock, counted across sizes. Stock is taken **when payment is confirmed**, not before. |
| Size and colour | Required, and must be one of the product's own options, where the product has them. Both are saved on the order. |
| Sale price | The original price must be higher than the price (a database rule). The storefront shows the sale only in that case. |
| Promo code | Applied by the server. Percentages round down. A discount never takes the total below ₦100. |
| Promo code limits | Start and end dates, minimum order, total uses and one use per customer email. Only paid orders count as uses. |
| Prices | Always from the catalogue at checkout, never from the browser. The checkout's total is the amount Flutterwave must confirm. |

**Stock shortfall.** Stock is taken only on payment, so two people can pay for the last item at about the same time. The second order is still placed, because the money has been taken. The shortfall is recorded on the order and the order is flagged in three places:
- the admin bell: "stock short, check before fulfilling";
- the staff email;
- the order's details in admin.

Restock the item, or refund the missing items.

**Cancelling** a paid order puts back exactly the stock or pre-order allowance it took.

## Admin

- **Products:**
  - The original price must be higher than the price.
  - There is a release date field and a "Take pre-orders" section, with a ship date and the number of pre-orders available.
  - Members-only is labelled as not buyable for now.
  - The old "External payment link" field is now labelled as a staff-only reference: customers always pay through checkout.
- **Promo codes** (`/admin/promos`):
  - Create percent or fixed-amount codes, with optional minimum order, start and end dates, usage limit and one use per customer.
  - Switch codes on or off.
  - See uses and the total discount given.
  - Codes are never deleted, so past orders keep their record.
  - Needs `products.write` to manage and `products.read` to view.
- **Orders:** each order shows colour, pre-order lines, the discount and any stock shortfall.

## Data and retention

- `checkouts` is service-role only.
- Checkouts that are never paid keep their payment records, but their email and address are removed after 30 days (`run_retention`). The privacy policy says so.
- Unpaid orders taken before this change stay as they were. They don't appear in Track Order. Staff can still record an offline payment against them.
