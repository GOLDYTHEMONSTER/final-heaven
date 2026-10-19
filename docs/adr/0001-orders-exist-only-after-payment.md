# Orders exist only after verified payment

Before Flutterwave verifies a payment, the shopper's priced cart and delivery details live in a separate `checkouts` table, not in `orders`; `apply_verified_payment` creates the Order in the same transaction that records the payment. We chose this over keeping unpaid rows in `orders` with a pending status because every reader of orders (admin lists, analytics, trends, customer summaries, Track Order, stock) would otherwise have to filter out unpaid rows, and one missed filter shows customers or staff an order that was never paid for.

## Consequences

- Stock and promo-code uses are counted when the Order is created, never at checkout; two shoppers can pay for the last unit, which is recorded as a stock shortfall for staff to resolve.
- Payments point at a checkout until they place the order. Unpaid checkouts keep their payment records but lose personal details after 30 days.
