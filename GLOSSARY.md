# Final Heaven store

A single storefront selling limited-run streetwear in Nigeria, paid through Flutterwave, run by staff from the admin.

## Language

### Buying

**Cart**:
The items a shopper has chosen, kept in their browser. Carries no authority over price or availability.
_Avoid_: basket, bag

**Quote**:
The server's price for a cart: each line's price and any problem with it, the discount and the total that will be charged.
_Avoid_: estimate, cart total

**Checkout**:
A priced cart with delivery details, waiting for payment. It is not an order and is never shown to the shopper as one.
_Avoid_: pending order, unpaid order, session

**Order**:
A purchase whose payment Flutterwave has verified. It has an order number and tracking number; nothing earlier does.
_Avoid_: purchase, sale

**Stock shortfall**:
Units on a paid order that stock couldn't cover when the payment arrived, so staff must restock or refund them.
_Avoid_: oversell, backorder

### Catalogue

**Purchase state**:
Whether a product can be bought right now: available, pre-order, sold out, coming soon or members only.
_Avoid_: availability, status (status is the product's draft/active/archived setting)

**Pre-order**:
A product bought and paid for now that ships from a set date, limited to its own pre-order allowance rather than stock.
_Avoid_: backorder, reservation

**Sale price**:
A product's price when an original price higher than it is shown crossed out.
_Avoid_: discount (a discount comes from a promo code)

**Promo code**:
A code a shopper enters to take a percentage or fixed amount off the cart, with its own dates and limits.
_Avoid_: coupon, voucher, discount code

### Shipping and cost recovery

**Shipping contribution**:
The part of a product's price set aside for international freight. Internal only: customers see one price.
_Avoid_: shipping fee, delivery charge

**Freight recovery**:
The part of the shipping contribution that pays freight. The recovery target is the share of freight it aims to cover (50% unless changed).
_Avoid_: shipping profit

**Logistics reserve**:
A balance set aside from contributions for freight surprises (re-weighing, rate rises). Never revenue.
_Avoid_: buffer, profit

**Platform contribution**:
The platform's own share of a price. Held while its order is open; earned once the order is delivered.
_Avoid_: commission, fee

**Unfunded freight**:
Freight that no contribution, subsidy or reserve draw pays for, so the margin absorbs it. Always shown.
_Avoid_: loss, gap (alone)

**Shipment**:
A consolidated air shipment of paid orders, or an inventory batch (sea, or stock bought in by air), reconciled against the forwarder's invoice.
_Avoid_: delivery (that's the courier to the customer)

