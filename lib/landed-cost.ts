// Landed cost and gross margin for staff (never shown to customers).
//
//   landed cost  = unit cost × exchange rate (to naira) + shipping + customs + other
//   gross profit = selling price − landed cost
//   gross margin = gross profit ÷ selling price × 100
//
// Gross, not net: advertising, payment fees, refunds and running costs aren't in
// it. The exchange rate is the one staff recorded for this purchase; nothing
// here looks one up, so a rate change never silently moves a price or a margin.

export type CostInputs = {
  unitCost: number | null
  currency: string
  /** Naira per one unit of `currency`, as recorded; not needed for NGN. */
  fxRate: number | null
  shipping: number | null
  customs: number | null
  other: number | null
}

export type CostResult =
  | { ok: true; landed: number; parts: { label: string; amount: number }[] }
  | { ok: false; missing: string }

const kobo = (n: number) => Math.round(n * 100) / 100

export function landedCost(c: CostInputs): CostResult {
  if (c.unitCost == null) return { ok: false, missing: 'the unit cost' }
  const rate = c.currency === 'NGN' ? 1 : c.fxRate
  if (!rate) return { ok: false, missing: `the ${c.currency} to naira rate` }
  const parts = [
    { label: c.currency === 'NGN' ? 'Unit cost' : `Unit cost (${c.currency} ${c.unitCost} × ${rate})`, amount: kobo(c.unitCost * rate) },
    ...(c.shipping ? [{ label: 'Shipping', amount: kobo(c.shipping) }] : []),
    ...(c.customs ? [{ label: 'Customs and clearing', amount: kobo(c.customs) }] : []),
    ...(c.other ? [{ label: 'Other (prep, packaging…)', amount: kobo(c.other) }] : []),
  ]
  return { ok: true, landed: kobo(parts.reduce((t, p) => t + p.amount, 0)), parts }
}

/** Gross profit and margin at a selling price; no margin for a price of zero or less. */
export function grossMargin(price: number, landed: number): { profit: number; marginPct: number | null } {
  const profit = kobo(price - landed)
  return { profit, marginPct: Number.isFinite(price) && price > 0 ? Math.round((profit / price) * 1000) / 10 : null }
}
