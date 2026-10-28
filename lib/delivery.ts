// Delivery: when an order should arrive, and what Express costs. Pure, so the
// product page, the cart and checkout all show the same dates the server
// charges for (tests/unit/delivery.test.ts).
//
//   in stock (in Nigeria)          3–7 days
//   made to order (originals)      its lead time, then 3–7 days
//   ordered in from China          standard 14–21 days (free), or
//                                  Express by air 10–17 days (paid)
//   pre-order                      from its ship date, then 3–7 days
//
// Express is offered only when an order has ordered-in items: it is the air
// freight. An item that can't fly (ships_by_air off: lithium batteries) takes
// Express away from the whole order, which travels together. It costs ₦2,500 for the first kg of those items (chargeable
// weight) and ₦1,000 for each further kg or part of one. These are the
// owner's rules of 28 Oct 2026.

export const DELIVERY = {
  inStock: { min: 3, max: 7 },
  fromChina: { min: 14, max: 21 },
  expressFromChina: { min: 10, max: 17 },
  expressBaseKobo: 250_000,
  expressIncludedKg: 1,
  expressPerExtraKgKobo: 100_000,
} as const

export type DeliveryOption = 'standard' | 'express'
export const DELIVERY_OPTIONS: DeliveryOption[] = ['standard', 'express']

/** How a line reaches the customer. */
export type Supply =
  | { kind: 'stock' }
  | { kind: 'made'; leadDays: number }
  | { kind: 'ordered_in'; seaOnly?: true }
  | { kind: 'preorder'; shipsOn: string }

type Window = { min: number; max: number }

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Days from ordering until it arrives, for one line (pre-orders: from their ship date). */
function lineWindow(s: Supply, option: DeliveryOption): Window {
  if (s.kind === 'made') return { min: s.leadDays + DELIVERY.inStock.min, max: s.leadDays + DELIVERY.inStock.max }
  if (s.kind === 'ordered_in') return option === 'express' ? DELIVERY.expressFromChina : DELIVERY.fromChina
  return DELIVERY.inStock
}

/** How a product reaches the customer, from its catalogue row and purchase state (lib/catalog purchaseState). */
export function supplyOf(
  p: { fulfilment?: string | null; source_type?: string | null; lead_time_days?: number | null; ships_by_air?: boolean | null },
  state: { state: string; shipsOn?: string },
): Supply {
  if (state.state === 'preorder' && state.shipsOn) return { kind: 'preorder', shipsOn: state.shipsOn }
  if (p.fulfilment === 'made_to_order') {
    return p.source_type === 'wholesale' || p.source_type === 'distributor'
      ? (p.ships_by_air === false ? { kind: 'ordered_in', seaOnly: true } : { kind: 'ordered_in' })
      : { kind: 'made', leadDays: Number(p.lead_time_days) || 0 }
  }
  return { kind: 'stock' }
}

/**
 * The day an order placed now counts from: today, or launch day while
 * checkout waits for launch (null when no launch day is set yet).
 */
export function orderDayFor(payments: { closedFor: 'launch' | 'paused' | null; opensOn: string | null }, today: string): string | null {
  return payments.closedFor === 'launch' ? payments.opensOn : today
}

/** Delivery for one product on its own page: when it arrives, and Express when it comes from China. */
export function productDelivery(supply: Supply, orderDay: string | null) {
  const express = expressAvailable([supply])
  return {
    standard: estimate([supply], 'standard', orderDay),
    express: express ? estimate([supply], 'express', orderDay) : null,
    /** Express for one unit up to 1 kg; more by weight at checkout. */
    expressFromKobo: express ? DELIVERY.expressBaseKobo : null,
  }
}
export type ProductDelivery = ReturnType<typeof productDelivery>

/** Whether an order can choose Express: something in it comes from China, and nothing in it is sea freight only. */
export const expressAvailable = (supplies: Supply[]) =>
  supplies.some((s) => s.kind === 'ordered_in') && !supplies.some((s) => s.kind === 'ordered_in' && s.seaOnly)

/**
 * When the order should arrive, ordered on `orderDay`: the latest of its lines,
 * since an order travels together. Without an order day (no launch date yet),
 * only the number of days.
 */
export function estimate(supplies: Supply[], option: DeliveryOption, orderDay: string | null):
  { minDays: number; maxDays: number; from: string | null; to: string | null } {
  let minDays = 0
  let maxDays = 0
  let from: string | null = null
  let to: string | null = null
  for (const s of supplies.length ? supplies : [{ kind: 'stock' } as Supply]) {
    if (s.kind === 'preorder') {
      // A pre-order arrives a few days after its ship date, whenever it's ordered.
      const a = addDays(s.shipsOn, DELIVERY.inStock.min)
      const b = addDays(s.shipsOn, DELIVERY.inStock.max)
      if (!from || a > from) from = a
      if (!to || b > to) to = b
      continue
    }
    const w = lineWindow(s, option)
    minDays = Math.max(minDays, w.min)
    maxDays = Math.max(maxDays, w.max)
  }
  if (orderDay) {
    const a = addDays(orderDay, minDays)
    const b = addDays(orderDay, maxDays)
    if (!from || a > from) from = a
    if (!to || b > to) to = b
  }
  return { minDays, maxDays, from, to }
}

/** Express in kobo for the chargeable weight of the order's ordered-in items (unknown weight: the base fee). */
export function expressFee(kg: number | null): number {
  const extra = kg == null ? 0 : Math.max(0, Math.round((kg - DELIVERY.expressIncludedKg) * 1000) / 1000)
  return DELIVERY.expressBaseKobo + Math.ceil(extra) * DELIVERY.expressPerExtraKgKobo
}

/** "Fri 13 Nov" for a YYYY-MM-DD day. */
export function shortDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** "Get it 10–17 Nov", "Get it 30 Nov – 6 Dec", or "Get it in 14–21 days" without dates. */
export function arrivalText(e: { minDays: number; maxDays: number; from: string | null; to: string | null }) {
  if (!e.from || !e.to) return `in ${e.minDays}–${e.maxDays} days`
  return `${shortDay(e.from)} – ${shortDay(e.to)}`
}
