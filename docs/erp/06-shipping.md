# Shipping and cost recovery

Migration: `supabase/migrations/20261027120000_shipping_engine.sql`. Code: the engine `lib/shipping/engine.ts` (every formula, pure), its Supabase readers `lib/shipping/store.ts`, the dashboard figures `lib/shipping/report.ts`, staff input `lib/shipping/admin.ts`, the endpoints `app/api/admin/shipping/*`, the pages `app/admin/shipping/*`, and the product editor's `components/admin/ShippingFields.tsx`. Tests: `tests/unit/shipping.test.ts`, `tests/unit/shipping-report.test.ts`, the "shipping allocation" block of `tests/unit/checkout.test.ts`, and `tests/db/shipping.test.ts`. Terms: `GLOSSARY.md`.

## What customers see: nothing new

Customers pay one price per product, as before; checkout totals don't change. The **shipping contribution** is the part of that price set aside for international freight. It is worked out by the server and recorded internally. The quote endpoint returns none of it.

## How a price is split

For one unit of a product (all in `priceBreakdown`):

```
price = supplier cost + China-side shipping + customs and other costs + payment fees
      + shipping contribution + platform contribution + product margin
```

The shipping contribution is set like this (`contribution`):

1. **Freight.** Chargeable weight × the rate's all-in cost per kg.
   - **Chargeable weight** is the greater of packed weight (plus packaging) and volumetric weight (L × W × H ÷ the forwarder's own divisor).
   - **All-in cost per kg** is the freight rate, plus surcharges, clearance when the rate doesn't include it, handling spread over a usual shipment, and contingency. Insurance is added on the goods value.
2. **Target.** Freight × the recovery target (50% unless changed).
3. **Recommendation.**
   - Start from the target ÷ (1 − reserve share), so recovery still meets the target after the reserve's share.
   - Multiply by the class factor, the value-tier factor and the product's own factor.
   - Raise to the minimum, then lower to the maximum, then to the % of price cap. The cap wins over the minimum.
   - Round to whole naira.
4. **Override.** A staff override with a reason, if one is set. The database records who set it, and the audit log keeps every change.
5. **Clearance campaign.** It may keep only part of the contribution, or pay the freight from its budget (subsidy).
6. **Split.** The reserve gets its share of the contribution; the rest is **freight recovery**. Whatever freight neither recovery nor a subsidy covers is **unfunded freight**. It is shown everywhere and never hidden. The margin after freight is what's left once it is paid.

**Shipping classes** come from chargeable weight, never from the category. Staff can choose a class on a product. The five starting classes have weight bands and no money limits until staff set them.

**Sea freight is separate.**
- A product bought in by sea uses the freight its reconciled batch really cost per unit.
- Before such a batch exists, the sea rate (per m³) gives an estimate.
- The air formula is never used for sea.

## When the figures are fixed

| Moment | What happens |
|---|---|
| Checkout starts | The server works out the order's allocation from its own prices and saves it with the checkout. The snapshot includes each line's freight, contribution, recovery, reserve, platform share, subsidy and the rate used. If this fails, checkout goes ahead without one. |
| Checkout resumed | Uses the snapshot already saved. A rate change never changes what a customer pays: prices come from the catalogue. |
| Payment verified | The order is placed and its allocation copied to `order_shipping_allocations`, where it can never be changed. Its shares go into the ledger once each, so duplicate webhooks add nothing. A campaign subsidy is cut to what the budget has left. |
| Order cancelled / fully refunded | Every entry the order posted is reversed by a new entry, once. |
| Partly refunded | Not reversed automatically. The dashboard lists it for a manual ledger adjustment. |
| Shipment reconciled | The invoice is compared with the estimate, and the actual cost is shared out by chargeable weight. Finance chooses whether to cover a shortfall from the reserve and whether a surplus goes to it. The rest is recorded as unfunded freight. The estimate stays on record beside the actual cost. |

**Platform contribution** is "held" until its order is delivered (or shipped, by setting), then "earned". The **logistics reserve** is a balance and is never counted as revenue.

## Rates

- Rates are entered by staff, who confirm them. There is no default rate.
  - Without a rate, estimates say **incomplete**.
  - Orders then record no freight, rather than a guess.
- A saved rate's terms can't be edited (the database refuses). **Replace** it instead: the old one ends the day before and is marked superseded.
- Clearance is included only when the rate says so. Otherwise it's priced separately, or the estimate says it's left out.

## Shipments

- **Order shipments (air)** group paid orders. The estimate comes from the orders' snapshots, or from the rate over the shipment's total weight. The minimum chargeable weight, rounding and minimum charge apply here, to the shipment, never to each product.
- **Inventory batches** (sea, or stock bought in by air) carry products, their costs and their sizes.
  - *Receive into stock* adds to the products' own stock, the one checkout reads, and lowers "on order". It happens once per click, never past what was ordered.
  - On reconciliation the batch's costs are shared over its lines by the chosen method: value, weight, volume, chargeable weight, quantity, or a hybrid (freight by volume, duties by value).
  - Landed cost per unit is per unit received when some didn't arrive.
- An estimate is kept once a shipment is booked. A reconciled shipment's orders, lines and invoices can't change.

## Clearance

- A campaign's discount is applied through the store's existing sale price: the old price shows crossed out.
- Before anything goes on sale, every product is priced at its clearance price.
  - Ones that lose money after freight, fall below the margin floor or have no supplier cost wait for finance's approval, product by product.
  - Products marked "can't go on clearance" are skipped.
- **Ending** a campaign puts each price back, unless staff have changed it since.
- Below-target campaigns need finance's approval before they start. Changing what an approved campaign does withdraws the approval.

## Who can do what

| Permission | Roles | Allows |
|---|---|---|
| `shipping.read` | Owner, administrator, finance manager, inventory manager, analyst | All shipping pages and previews |
| `shipping.manage` | Owner, administrator, inventory manager | Rates, rules, classes, product profiles, shipments, receiving, campaigns (applying prices also needs `products.write`) |
| `finance.adjust` | Owner, finance manager | Finalising reconciliations, manual ledger entries, approving clearance exceptions |

- RLS enforces all of this in the database as well.
- The ledger, order allocations, receipts and reconciliations have no write grant at all: only the database functions and order triggers write them.
- Ledger entries are append-only.
- Everything is per business (tenant).

## Before switching it on

1. Apply the migration (dry-run first; see CLAUDE.md), then deploy.
   - Deploying the code first is safe: checkout goes ahead without an allocation.
   - Applying the migration first is still the rule.
2. Enter your forwarder's air rate (and the sea rate, if any) in **Shipping → Rates and rules**.
3. Set the rules: reserve share, platform share, caps, margin floor, payment fees.
4. Enter packed weights (and sizes) on products, starting with the bestsellers.
5. Run the **Simulator** on the catalogue to see which products under-recover, lose money or hit the cap before real orders use the rules.
