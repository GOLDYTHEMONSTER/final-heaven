// Event tickets (docs/erp/08-events.md; data: 20261102100000_event_tickets.sql).
//
//   salesState(event, now)        whether an event's tickets are on sale, and if not why
//   quoteTickets(...)             the server's price for a ticket order, problems per line
//   ticketDiscount(...)           what a waitlist member's early access code takes off tickets
//   showCode / readRef            door codes as people read and type them
//
// Guarantees (tests/unit/events.test.ts):
//  - prices come only from the tiers, never from the browser;
//  - sales follow the event's own window, separate from the shop's launch day,
//    and stop while the event or the whole store is paused;
//  - no more tickets than the event allows per order, or than are free;
//  - shop promo codes don't work on tickets: only a subscriber's personal
//    early access code does, for their own email, once, on at most
//    TICKETS.discountedPerOrder tickets (the dearest ones), and never below
//    the smallest online charge. Using it on tickets doesn't use up its shop discount.
import { formatMinor, fromMinor, toMinor } from '@/lib/money'

export const TICKETS = {
  /** How long an unpaid checkout keeps its seats (matches open_ticket_checkout). */
  holdMinutes: 30,
  /** An early access code discounts at most this many tickets per order. */
  discountedPerOrder: 2,
  /** Flutterwave's smallest charge here: ₦100. */
  minChargeMinor: 10_000,
} as const

/** Shown on the event page when the event has no terms of its own. The owner should review it. */
export const DEFAULT_TICKET_TERMS =
  'Each ticket lets one person in once; the first scan of its QR code is the one that counts, so keep it to yourself. ' +
  'Tickets can’t be refunded unless the event is cancelled or moved, in which case we refund you in full.'

export type EventStatus = 'draft' | 'published' | 'cancelled'

export type EventRow = {
  id: string
  tenant_id: string
  store_id: string
  slug: string
  title: string
  description: string
  venue: string
  address: string
  image_url: string | null
  starts_at: string
  ends_at: string | null
  sales_open_at: string | null
  sales_close_at: string | null
  sales_paused: boolean
  max_per_order: number
  terms: string
  status: EventStatus
  currency: string
}

export type TierRow = {
  id: string
  name: string
  description: string
  price: number | string
  capacity: number
  sort: number
  active: boolean
}

export type SalesState =
  | { open: true; closesAt: string }
  | { open: false; reason: 'draft' | 'cancelled' | 'paused' | 'not_yet' | 'ended'; opensAt?: string }

/** Whether tickets are on sale. `storePaused` is the store-wide stop (stores.purchases_paused). */
export function salesState(e: Pick<EventRow, 'status' | 'sales_paused' | 'sales_open_at' | 'sales_close_at' | 'starts_at'>, now = new Date(), storePaused = false): SalesState {
  if (e.status === 'draft') return { open: false, reason: 'draft' }
  if (e.status === 'cancelled') return { open: false, reason: 'cancelled' }
  if (e.sales_paused || storePaused) return { open: false, reason: 'paused' }
  if (e.sales_open_at && new Date(e.sales_open_at) > now) return { open: false, reason: 'not_yet', opensAt: e.sales_open_at }
  const closesAt = e.sales_close_at ?? e.starts_at
  if (now >= new Date(closesAt)) return { open: false, reason: 'ended' }
  return { open: true, closesAt }
}

export function closedMessage(s: SalesState): string | null {
  if (s.open) return null
  switch (s.reason) {
    case 'draft': return 'Tickets aren’t on sale.'
    case 'cancelled': return 'This event has been cancelled.'
    case 'paused': return 'Ticket sales are paused for a moment. Please try again soon.'
    case 'not_yet': return 'Tickets aren’t on sale yet.'
    case 'ended': return 'Ticket sales have ended.'
  }
}

// ---------------------------------------------------------------------------
// The early access discount
// ---------------------------------------------------------------------------

/** A code as the store found it (lib/events/store), before checking it against this order. */
export type CodeContext = {
  promoCodeId: string
  code: string
  /** True only for a subscriber's personal early access code. */
  personal: boolean
  active: boolean
  /** The percent it takes off now (their invite credits included, lib/early-access). */
  percent: number
  /** Belongs to a subscriber with a different email from the buyer's. */
  forOtherEmail: boolean
  /** Already used on a paid ticket order. */
  usedOnTickets: boolean
  /** Past its end (30 days after the shop's launch day). */
  expired: boolean
  /** The buyer hasn't typed an email yet, so whose code it is can't be checked. */
  needsEmail?: boolean
}

export type Discount = { promoCodeId: string; code: string; percent: number; minor: number; tickets: number }

/** What a code takes off these tickets (unit prices in minor units, one per ticket), or why it doesn't apply. */
export function ticketDiscount(ctx: CodeContext | null, unitPricesMinor: number[], subtotalMinor: number): Discount | { error: string } {
  if (!ctx || !ctx.active) return { error: 'That code isn’t valid.' }
  if (!ctx.personal) return { error: 'Shop promo codes don’t work on tickets. Waitlist members can use their own early access code.' }
  if (ctx.needsEmail) return { error: 'Enter the email you signed up with, then your code.' }
  if (ctx.forOtherEmail) return { error: 'That code belongs to another email. Use the email you signed up with.' }
  if (ctx.expired) return { error: 'That code has expired.' }
  if (ctx.usedOnTickets) return { error: 'You’ve already used your code on tickets.' }
  const dearest = [...unitPricesMinor].sort((a, b) => b - a).slice(0, TICKETS.discountedPerOrder)
  const raw = Math.floor((dearest.reduce((s, p) => s + p, 0) * ctx.percent) / 100)
  const minor = Math.max(0, Math.min(raw, subtotalMinor - TICKETS.minChargeMinor))
  if (minor === 0) return { error: 'That code doesn’t apply to this order.' }
  return { promoCodeId: ctx.promoCodeId, code: ctx.code, percent: ctx.percent, minor, tickets: dearest.length }
}

// ---------------------------------------------------------------------------
// Quoting
// ---------------------------------------------------------------------------

export type TicketLine = { tierId: string; quantity: number }

export type QuoteLine = {
  tierId: string
  name: string
  quantity: number
  unitMinor: number
  lineMinor: number
  issue: string | null
}

export type TicketQuote = {
  currency: string
  lines: QuoteLine[]
  count: number
  subtotalMinor: number
  discount: Discount | null
  codeError: string | null
  totalMinor: number
  /** Why the order can't be bought as it stands, or null. */
  issue: string | null
  ok: boolean
}

/**
 * The server's price for a ticket order. `free` is each tier's seats left
 * after sales and live holds (ticket_availability). Lines for the same tier
 * are added together.
 */
export function quoteTickets(
  event: Pick<EventRow, 'status' | 'sales_paused' | 'sales_open_at' | 'sales_close_at' | 'starts_at' | 'max_per_order' | 'currency'>,
  tiers: TierRow[],
  free: Record<string, number>,
  wanted: TicketLine[],
  { code = null, codeContext = null, now = new Date(), storePaused = false }: { code?: string | null; codeContext?: CodeContext | null; now?: Date; storePaused?: boolean } = {},
): TicketQuote {
  const currency = event.currency
  const merged = new Map<string, number>()
  for (const w of wanted) merged.set(w.tierId, (merged.get(w.tierId) ?? 0) + w.quantity)

  const lines: QuoteLine[] = []
  for (const [tierId, quantity] of merged) {
    const tier = tiers.find((t) => t.id === tierId)
    if (!tier) {
      lines.push({ tierId, name: 'Ticket', quantity, unitMinor: 0, lineMinor: 0, issue: 'This ticket isn’t available.' })
      continue
    }
    const unitMinor = toMinor(tier.price, currency)
    const left = Math.max(0, free[tierId] ?? 0)
    const issue = !tier.active ? 'This ticket isn’t on sale.'
      : left === 0 ? `${tier.name} is sold out.`
      : quantity > left ? `Only ${left} ${tier.name} ${left === 1 ? 'ticket is' : 'tickets are'} left.`
      : null
    lines.push({ tierId, name: tier.name, quantity, unitMinor, lineMinor: unitMinor * quantity, issue })
  }

  const count = lines.reduce((s, l) => s + l.quantity, 0)
  const subtotalMinor = lines.reduce((s, l) => s + l.lineMinor, 0)
  const sales = salesState(event, now, storePaused)

  let discount: Discount | null = null
  let codeError: string | null = null
  if (code) {
    const r = ticketDiscount(codeContext, lines.flatMap((l) => Array(l.quantity).fill(l.unitMinor)), subtotalMinor)
    if ('error' in r) codeError = r.error
    else discount = r
  }
  const totalMinor = subtotalMinor - (discount?.minor ?? 0)

  const issue = closedMessage(sales)
    ?? (count === 0 ? 'Choose at least one ticket.' : null)
    ?? (count > event.max_per_order ? `You can buy up to ${event.max_per_order} tickets per order.` : null)
    ?? lines.find((l) => l.issue)?.issue
    ?? codeError
    ?? (totalMinor < TICKETS.minChargeMinor ? `The smallest order we can take online is ${formatMinor(TICKETS.minChargeMinor, currency)}.` : null)
  return { currency, lines, count, subtotalMinor, discount, codeError, totalMinor, issue, ok: issue === null }
}

/** A ticket price for display: ₦15,000, with kobo only when there are any. */
export function priceLabel(amount: number | string, currency = 'NGN'): string {
  const n = Number(amount)
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n)
}

/** A TicketQuote as the event page receives it: amounts as decimal strings. */
export function ticketQuoteJson(q: TicketQuote) {
  const m = (minor: number) => fromMinor(minor, q.currency)
  return {
    currency: q.currency,
    lines: q.lines.map((l) => ({ id: l.tierId, name: l.name, quantity: l.quantity, unitPrice: m(l.unitMinor), lineTotal: m(l.lineMinor), issue: l.issue })),
    count: q.count,
    subtotal: m(q.subtotalMinor),
    discount: q.discount && { code: q.discount.code, percent: q.discount.percent, amount: m(q.discount.minor), tickets: q.discount.tickets },
    codeError: q.codeError,
    total: m(q.totalMinor),
    issue: q.issue,
    ok: q.ok,
  }
}
export type TicketQuoteJson = ReturnType<typeof ticketQuoteJson>

// ---------------------------------------------------------------------------
// Door codes and addresses
// ---------------------------------------------------------------------------

const CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/
const TOKEN = /^[0-9a-f]{32}$/

/** K7M 42Q: upper case in two groups, easy to read aloud. */
export const showCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`.toUpperCase()

/** What someone typed or scanned at the door: a ticket's token, its code, or nothing usable. */
export function readRef(value: unknown): { kind: 'token' | 'code'; value: string } | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  // A whole scanned link (…/t/<token>) counts as its token.
  const fromUrl = raw.match(/\/t\/([0-9a-fA-F]{32})(?:[/?#]|$)/)?.[1]
  const v = (fromUrl ?? raw).replace(/[^0-9A-Za-z]/g, '').toLowerCase()
  if (TOKEN.test(v)) return { kind: 'token', value: v }
  if (CODE.test(v)) return { kind: 'code', value: v }
  return null
}

export const validToken = (value: unknown): value is string => typeof value === 'string' && TOKEN.test(value)

/** One ticket's page: what its QR code opens. */
export const ticketUrl = (site: string, token: string) => `${site.replace(/\/$/, '')}/t/${token}`
/** All of an order's tickets, linked from the ticket email. */
export const ticketsUrl = (site: string, accessToken: string) => `${site.replace(/\/$/, '')}/tickets/${accessToken}`

/** A slug from a title: "Final Heaven Launch Night" -> "final-heaven-launch-night". */
export function slugify(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
}

/** When an event happens, in the store's time zone: "Sat 21 November at 8:00 pm". */
export function eventWhen(startsAt: string, timeZone = 'Africa/Lagos'): string {
  return new Date(startsAt).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
  })
}
