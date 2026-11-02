// Event tickets in the database (lib/events for the rules,
// 20261102100000_event_tickets.sql for the tables). Server only: service key.
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BadRequest, email as readEmail, reference, text } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { getStorefront, type StoreContext } from '@/lib/tenancy'
import { paymentDeps, siteUrl } from '@/lib/payments'
import { startPayment } from '@/lib/payments/service'
import { fromMinor, toMinor } from '@/lib/money'
import { earlyEndsAt, earlyPercent } from '@/lib/early-access'
import { inviteCredits } from '@/lib/early-access-store'
import { quoteTickets, salesState, type CodeContext, type EventRow, type SalesState, type TicketLine, type TicketQuote, type TierRow } from './index'

export const EVENT_COLUMNS =
  'id, tenant_id, store_id, slug, title, description, venue, address, image_url, starts_at, ends_at, sales_open_at, sales_close_at, sales_paused, max_per_order, terms, status, currency'
export const TIER_COLUMNS = 'id, name, description, price, capacity, sort, active'

/** Where Flutterwave sends ticket buyers back to (app/events/complete). */
export const TICKETS_RETURN_PATH = '/events/complete'
/** The cookie a door link leaves on a helper's phone: the link's secret. */
export const DOOR_COOKIE = 'fh_door'

export type PublicEvent = {
  store: StoreContext
  event: EventRow
  tiers: TierRow[]
  /** Seats still free per tier, after sales and live holds. */
  free: Record<string, number>
  storePaused: boolean
  paymentsOpenOn: string | null
}

/** A published (or cancelled) event of this storefront, with its tiers on sale and their free seats. Null for drafts and unknown slugs. */
export async function loadPublicEvent(slug: string, db: SupabaseClient = createSupabaseServiceClient()): Promise<PublicEvent | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null
  const store = await getStorefront()
  const { data: event, error } = await db.from('events').select(EVENT_COLUMNS)
    .eq('store_id', store.storeId).eq('slug', slug).in('status', ['published', 'cancelled']).maybeSingle()
  if (error) throw error
  if (!event) return null
  const [tiers, free, shop] = await Promise.all([
    db.from('ticket_types').select(TIER_COLUMNS).eq('event_id', event.id).eq('active', true).order('sort').order('price'),
    db.rpc('ticket_availability', { p_event: event.id }),
    db.from('stores').select('purchases_paused, payments_open_on').eq('id', store.storeId).single(),
  ])
  if (tiers.error) throw tiers.error
  if (free.error) throw free.error
  if (shop.error) throw shop.error
  return {
    store,
    event: event as EventRow,
    tiers: (tiers.data ?? []) as TierRow[],
    free: Object.fromEntries(((free.data ?? []) as { ticket_type_id: string; free: number }[]).map((r) => [r.ticket_type_id, Number(r.free)])),
    storePaused: Boolean(shop.data.purchases_paused),
    paymentsOpenOn: shop.data.payments_open_on ?? null,
  }
}

export type EventCard = { event: EventRow; fromMinor: number | null; soldOut: boolean; sales: SalesState }

/**
 * Published (and cancelled) events for /events: the ones still to come, soonest
 * first, and the latest past ones. An event counts as past 6 hours after it
 * starts, or when it ends.
 */
export async function listPublicEvents(db: SupabaseClient = createSupabaseServiceClient(), now = new Date()): Promise<{ upcoming: EventCard[]; past: EventCard[]; timeZone: string }> {
  const store = await getStorefront()
  const [events, shop] = await Promise.all([
    db.from('events').select(EVENT_COLUMNS).eq('store_id', store.storeId).in('status', ['published', 'cancelled']).order('starts_at', { ascending: false }).limit(40),
    db.from('stores').select('purchases_paused').eq('id', store.storeId).single(),
  ])
  if (events.error) throw events.error
  if (shop.error) throw shop.error
  const rows = (events.data ?? []) as EventRow[]
  const ids = rows.map((e) => e.id)
  const { data: tiers, error } = ids.length
    ? await db.from('ticket_types').select('id, event_id, price').in('event_id', ids).eq('active', true)
    : { data: [], error: null }
  if (error) throw error
  const over = (e: EventRow) => now.getTime() > (e.ends_at ? new Date(e.ends_at).getTime() : new Date(e.starts_at).getTime() + 6 * 3_600_000)
  const upcomingRows = rows.filter((e) => !over(e)).reverse()
  // Seats only matter for what's still to come.
  const free = new Map<string, number>()
  await Promise.all(upcomingRows.map(async (e) => {
    const { data, error: ae } = await db.rpc('ticket_availability', { p_event: e.id })
    if (ae) throw ae
    free.set(e.id, ((data ?? []) as { free: number }[]).reduce((s, r) => s + Number(r.free), 0))
  }))
  const card = (e: EventRow): EventCard => {
    const prices = (tiers ?? []).filter((t) => t.event_id === e.id).map((t) => toMinor(t.price, e.currency))
    return {
      event: e,
      fromMinor: prices.length ? Math.min(...prices) : null,
      soldOut: prices.length > 0 && free.get(e.id) === 0,
      sales: salesState(e, now, Boolean(shop.data.purchases_paused)),
    }
  }
  return { upcoming: upcomingRows.map(card), past: rows.filter(over).slice(0, 6).map(card), timeZone: store.timeZone }
}

/**
 * A code as entered for tickets. Only a subscriber's personal early access
 * code applies (lib/events ticketDiscount says why others don't). Its use on
 * tickets is counted on ticket orders, separately from its use in the shop.
 */
export async function codeContext(db: SupabaseClient, tenantId: string, code: string, buyerEmail: string | null, paymentsOpenOn: string | null, now = new Date()): Promise<CodeContext | null> {
  const { data: promo, error } = await db.from('promo_codes').select('id, code, active, ends_at, subscriber_id')
    .eq('tenant_id', tenantId).eq('code', code).maybeSingle()
  if (error) throw error
  if (!promo) return null
  const base = { promoCodeId: promo.id, code: promo.code, active: Boolean(promo.active), forOtherEmail: false, usedOnTickets: false, expired: false, percent: 0 }
  if (!promo.subscriber_id) return { ...base, personal: false }
  if (!buyerEmail) return { ...base, personal: true, needsEmail: true }

  const [{ data: owner, error: oe }, credits, { count, error: ue }] = await Promise.all([
    db.from('newsletter_subscribers').select('email').eq('id', promo.subscriber_id).maybeSingle(),
    inviteCredits(db, promo.subscriber_id),
    db.from('ticket_orders').select('id', { head: true, count: 'exact' }).eq('promo_code_id', promo.id).eq('payment_status', 'paid'),
  ])
  if (oe) throw oe
  if (ue) throw ue
  if (!owner) return null
  const ends = [promo.ends_at, earlyEndsAt(paymentsOpenOn)].filter(Boolean).map((d) => new Date(d as string).getTime())
  return {
    ...base,
    personal: true,
    percent: earlyPercent(credits),
    forOtherEmail: owner.email.trim().toLowerCase() !== buyerEmail.trim().toLowerCase(),
    usedOnTickets: (count ?? 0) > 0,
    expired: ends.some((t) => now.getTime() > t),
  }
}

/** The ticket lines in a request body: [{ id, quantity }], up to 10 lines. */
export function readLines(value: unknown): TicketLine[] {
  if (!Array.isArray(value) || value.length > 10) throw new BadRequest('Choose your tickets again.')
  return value.map((v) => {
    const tierId = typeof v?.id === 'string' ? v.id : ''
    const quantity = Number(v?.quantity)
    if (!/^[0-9a-f-]{36}$/.test(tierId) || !Number.isInteger(quantity) || quantity < 0 || quantity > 20) throw new BadRequest('Choose your tickets again.')
    return { tierId, quantity }
  }).filter((l) => l.quantity > 0)
}

/** A buyer's phone number: required, for reaching them about their tickets. Digits with an optional +, spaces or dashes. */
export function readPhone(value: unknown): string {
  const phone = text(value, 'Phone number', { max: 30, required: true })!
  const digits = phone.replace(/[\s()-]/g, '')
  if (!/^\+?\d{7,15}$/.test(digits)) throw new BadRequest('Enter a phone number we can reach you on, like 0803 123 4567.')
  return digits
}

const readCode = (value: unknown) => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!code) return null
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new BadRequest('That code isn’t valid.')
  return code
}

/** The server's quote for a ticket order on an event's page. */
export async function quoteForEvent(ev: PublicEvent, body: Record<string, unknown>, db: SupabaseClient = createSupabaseServiceClient()): Promise<TicketQuote> {
  const code = readCode(body.code)
  const buyer = typeof body.email === 'string' && body.email.includes('@') ? body.email.trim() : null
  const ctx = code ? await codeContext(db, ev.store.tenantId, code, buyer, ev.paymentsOpenOn) : null
  return quoteTickets(ev.event, ev.tiers, ev.free, readLines(body.items), { code, codeContext: ctx, storePaused: ev.storePaused })
}

export type BeginResult =
  | { ok: true; paymentUrl: string; checkout: string }
  | { ok: false; status: 409 | 503; message: string }

/** "Held" errors from open_ticket_checkout: the tier and the seats still free. */
function heldTier(error: { message?: string; details?: string | null } | null) {
  const match = error?.message?.match(/^held:(.+)$/)
  return match ? { tierId: match[1], free: Math.max(0, Number(error?.details) || 0) } : null
}

/**
 * Buying tickets: prices the order on the server, opens a ticket checkout
 * holding its seats (open_ticket_checkout re-checks prices, seats and the sale
 * window under lock) and starts the Flutterwave payment for exactly that total.
 * No ticket exists until Flutterwave confirms the payment.
 */
export async function beginTicketCheckout(req: Request, ev: PublicEvent, body: Record<string, unknown>, db: SupabaseClient = createSupabaseServiceClient()): Promise<BeginResult> {
  const buyerEmail = readEmail(body.email)
  const name = text(body.name, 'Name', { max: 120, required: true })!
  const phone = readPhone(body.phone)
  if (body.terms !== true) throw new BadRequest('Please accept the ticket terms.')
  const quote = await quoteForEvent(ev, { ...body, email: buyerEmail }, db)
  if (!quote.ok) return { ok: false, status: 409, message: quote.issue ?? 'These tickets can’t be bought right now.' }

  const checkoutRef = reference('TCK', 10)
  const { data: id, error } = await db.rpc('open_ticket_checkout', { p: {
    tenant_id: ev.store.tenantId, event_id: ev.event.id, reference: checkoutRef, order_number: reference('FHT', 6),
    email: buyerEmail, name, phone,
    items: quote.lines.map((l) => ({ ticket_type_id: l.tierId, name: l.name, quantity: l.quantity, unit_price: fromMinor(l.unitMinor, quote.currency) })),
    subtotal: fromMinor(quote.subtotalMinor, quote.currency), discount: fromMinor(quote.discount?.minor ?? 0, quote.currency),
    total: fromMinor(quote.totalMinor, quote.currency), promo_code_id: quote.discount?.promoCodeId ?? null, promo_code: quote.discount?.code ?? null,
    terms_accepted_at: new Date().toISOString(),
  } })
  const held = heldTier(error)
  if (held) {
    const tier = ev.tiers.find((t) => t.id === held.tierId)?.name ?? 'That ticket'
    return { ok: false, status: 409, message: held.free ? `Only ${held.free} ${tier} ${held.free === 1 ? 'ticket is' : 'tickets are'} left.` : `${tier} just sold out.` }
  }
  if (error?.message === 'event_closed') return { ok: false, status: 409, message: 'Ticket sales are closed.' }
  if (error?.message === 'price_changed') return { ok: false, status: 409, message: 'Prices just changed. Check your tickets and try again.' }
  if (error?.message === 'too_many') return { ok: false, status: 409, message: `You can buy up to ${ev.event.max_per_order} tickets per order.` }
  if (error) throw error

  const started = await startPayment(paymentDeps(), {
    kind: 'ticket_checkout', id: id as string, tenantId: ev.store.tenantId,
    amountMinor: quote.totalMinor, currency: quote.currency, email: buyerEmail, description: `${ev.event.title} tickets`,
  }, siteUrl(req), TICKETS_RETURN_PATH)
  if (!started.ok) {
    // Nobody can pay for it, so give the seats back at once.
    await db.from('ticket_checkouts').update({ hold_until: null }).eq('id', id as string).is('ticket_order_id', null)
    return { ok: false, status: 503, message: 'Payments are unavailable right now. Please try again in a few minutes.' }
  }
  return { ok: true, paymentUrl: started.checkoutUrl, checkout: checkoutRef }
}

// ---------------------------------------------------------------------------
// The buyer's tickets
// ---------------------------------------------------------------------------

export type TicketView = { token: string; code: string; status: 'valid' | 'checked_in' | 'void'; checkedInAt: string | null; type: string }
export type TicketOrderView = {
  orderNumber: string; name: string; email: string; status: 'confirmed' | 'cancelled'; total: string; currency: string
  event: Pick<EventRow, 'id' | 'slug' | 'title' | 'venue' | 'address' | 'starts_at' | 'ends_at' | 'status' | 'image_url'>
  tickets: TicketView[]
}

const ORDER_VIEW = 'order_number, name, email, status, total, currency, events(id, slug, title, venue, address, starts_at, ends_at, status, image_url), tickets(token, code, status, checked_in_at, created_at, ticket_types(name, sort))'

function toOrderView(row: Record<string, any>): TicketOrderView {
  const tickets = [...(row.tickets ?? [])].sort((a, b) => (a.ticket_types?.sort ?? 0) - (b.ticket_types?.sort ?? 0) || String(a.created_at).localeCompare(String(b.created_at)))
  return {
    orderNumber: row.order_number, name: row.name, email: row.email, status: row.status, total: String(row.total), currency: row.currency,
    event: row.events,
    tickets: tickets.map((t) => ({ token: t.token, code: t.code, status: t.status, checkedInAt: t.checked_in_at, type: t.ticket_types?.name ?? 'Ticket' })),
  }
}

/** An order's tickets by its access token (the link in the ticket email), or null. */
export async function loadTicketOrder(accessToken: string, db: SupabaseClient = createSupabaseServiceClient()): Promise<TicketOrderView | null> {
  if (!/^[0-9a-f]{32}$/.test(accessToken)) return null
  const store = await getStorefront()
  const { data, error } = await db.from('ticket_orders').select(ORDER_VIEW).eq('access_token', accessToken).eq('tenant_id', store.tenantId).maybeSingle()
  if (error) throw error
  return data ? toOrderView(data) : null
}

/** One ticket by its token (what its QR code holds), with its order and event, or null. */
export async function loadTicket(token: string, db: SupabaseClient = createSupabaseServiceClient()): Promise<{ ticket: TicketView; order: Omit<TicketOrderView, 'tickets'> } | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  const store = await getStorefront()
  const { data, error } = await db.from('tickets')
    .select('token, code, status, checked_in_at, ticket_types(name), ticket_orders(order_number, name, email, status, total, currency, events(id, slug, title, venue, address, starts_at, ends_at, status, image_url))')
    .eq('token', token).eq('tenant_id', store.tenantId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const t = data as Record<string, any>
  const { tickets: _none, ...order } = toOrderView({ ...t.ticket_orders, tickets: [] })
  return { ticket: { token: t.token, code: t.code, status: t.status, checkedInAt: t.checked_in_at, type: t.ticket_types?.name ?? 'Ticket' }, order }
}

// ---------------------------------------------------------------------------
// Door links
// ---------------------------------------------------------------------------

/** A new door link secret and the hash stored for it (event_door_links.token_hash). */
export function newDoorSecret(): { secret: string; hash: string } {
  const secret = randomBytes(24).toString('hex')
  return { secret, hash: hashDoorSecret(secret) }
}

export const hashDoorSecret = (secret: string) => createHash('sha256').update(secret).digest('hex')

export type DoorLink = { id: string; eventId: string; label: string; expiresAt: string }

/** The live door link behind a helper's cookie, or null when it's unknown, revoked or expired. */
export async function liveDoorLink(secret: string | undefined | null, db: SupabaseClient = createSupabaseServiceClient()): Promise<DoorLink | null> {
  if (!secret || !/^[0-9a-f]{48}$/.test(secret)) return null
  const { data, error } = await db.from('event_door_links').select('id, event_id, label, expires_at, revoked_at')
    .eq('token_hash', hashDoorSecret(secret)).maybeSingle()
  if (error) throw error
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null
  return { id: data.id, eventId: data.event_id, label: data.label, expiresAt: data.expires_at }
}

export type DoorOutcome = 'valid' | 'checked_in' | 'already' | 'void' | 'not_found' | 'door_closed'
export type DoorTicket = {
  id: string; code: string; status: 'valid' | 'checked_in' | 'void'; checkedInAt: string | null
  type: string; name: string; orderNumber: string; orderStatus: string; eventId: string; event: string; startsAt: string
}
export type DoorResult = { outcome: DoorOutcome; ticket?: DoorTicket }

/** Looks a ticket up at the door, or checks it in, as door staff or through a door link (public.door_ticket). */
export async function doorTicket(db: SupabaseClient, ref: string, { event = null, door = null, checkIn = false }: { event?: string | null; door?: string | null; checkIn?: boolean } = {}): Promise<DoorResult> {
  const { data, error } = await db.rpc('door_ticket', { p_ref: ref, p_event: event, p_door: door, p_check_in: checkIn })
  if (error) throw error
  return data as DoorResult
}
