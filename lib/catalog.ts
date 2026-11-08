// Whether and how a product can be bought, decided in one place for the
// storefront (what the button says) and checkout (what the server accepts).
// Pure: the caller supplies the store's local date.

import type { ProductDelivery } from '@/lib/delivery'
import type { SizeChart, Spec } from '@/lib/product-tables'

export type CatalogueProduct = {
  id: string
  name: string
  price: number | string
  original_price?: number | string | null
  stock: number | null
  status: string
  images: unknown
  category?: string
  members_only?: boolean | null
  /** Paused from the admin: still shown, can't be bought. */
  purchases_paused?: boolean | null
  release_date?: string | null
  preorder?: boolean | null
  preorder_ships_on?: string | null
  preorder_limit?: number | null
  sizes?: unknown
  colors?: unknown
  /** stock, or made_to_order (made after the order, in lead_time_days). */
  fulfilment?: string | null
  lead_time_days?: number | null
  /** original, wholesale, independent, distributor or local_maker: wholesale and distributor pieces are ordered in, not made. */
  source_type?: string | null
  /** False: sea freight only, no Express by air (lithium batteries). */
  ships_by_air?: boolean | null
}

/** A product as the storefront receives it from /api/products (see toPublicProduct). */
export interface Product {
  id: string
  name: string
  price: number
  originalPrice?: number
  images?: { url: string; color?: string }[]
  image?: string // legacy, for backward compatibility
  category: string
  description?: string
  isNew?: boolean
  isLimited?: boolean
  isTrending?: boolean
  membersOnly?: boolean
  releaseDate?: string
  rating?: number
  reviews?: number
  sales?: number
  stock: number
  status: 'active' | 'draft' | 'archived'
  colors?: string[]
  sizes?: string[]
  tags?: string[]
  cardSize?: 'large' | 'medium' | 'small'
  createdAt?: string
  /** Where it comes from: original, wholesale, independent, distributor or local_maker (lib/collections). */
  sourceType?: string
  /** stock (ready to ship) or made_to_order (made after the order, in about leadTimeDays). */
  fulfilment?: string
  leadTimeDays?: number
  /** False: sea freight only (no Express by air), so it takes longer (lib/delivery). */
  shipsByAir?: boolean
  /** Its label, when it has a published one. */
  brand?: { id: string; name: string; slug: string }
  /** From the server: whether and how this can be bought right now. */
  purchase?: PurchaseState
  /** On the product's own page: when it should arrive, and Express when it comes from China (lib/delivery). */
  delivery?: ProductDelivery
  /** On the product's own page only: the spec table and the size chart (lib/product-tables). */
  specs?: Spec[]
  sizeChart?: SizeChart | null
}

/** The columns the storefront reads for a product, with its published brand. */
export const PUBLIC_PRODUCT_SELECT = '*, brand:brands(id, name, slug)'

export type PurchaseState =
  | { state: 'available'; maxQuantity: number }
  | { state: 'preorder'; shipsOn: string; maxQuantity: number }
  | { state: 'sold_out' }
  | { state: 'coming_soon'; releaseDate: string }
  | { state: 'members_only' }
  | { state: 'paused' }
  | { state: 'unavailable' }

export function purchaseState(p: CatalogueProduct, today: string): PurchaseState {
  if (p.status !== 'active') return { state: 'unavailable' }
  if (p.purchases_paused) return { state: 'paused' }
  // Membership isn't live yet, so members-only items can't be bought by anyone.
  if (p.members_only) return { state: 'members_only' }
  if (p.preorder && p.preorder_ships_on) {
    const left = Math.max(0, Number(p.preorder_limit ?? 0))
    return left > 0 ? { state: 'preorder', shipsOn: p.preorder_ships_on, maxQuantity: left } : { state: 'sold_out' }
  }
  if (p.release_date && p.release_date.slice(0, 10) > today) return { state: 'coming_soon', releaseDate: p.release_date.slice(0, 10) }
  if (p.stock == null) return { state: 'available', maxQuantity: 999 } // stock not tracked
  const stock = Math.max(0, Number(p.stock))
  return stock > 0 ? { state: 'available', maxQuantity: stock } : { state: 'sold_out' }
}

export const canBuy = (s: PurchaseState) => s.state === 'available' || s.state === 'preorder'

/** Why an item can't be bought, in words for the customer. */
export function unavailableReason(name: string, s: PurchaseState): string {
  switch (s.state) {
    case 'members_only': return `${name} is for members only.`
    case 'coming_soon': return `${name} isn’t released yet.`
    case 'sold_out': return `${name} is sold out.`
    case 'paused': return `${name} can’t be bought right now.`
    default: return `${name} is no longer available.`
  }
}

/** Today's date (YYYY-MM-DD) in the store's time zone. */
export function storeToday(timeZone = 'Africa/Lagos', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

/** How a line's option reads: a colour ("Colour black") or a set's picks, which already name their groups. */
export const optionLabel = (option: string) => (option.includes(': ') ? option : `Colour ${option}`)

/** A sale is shown only when the original price is genuinely higher. */
export function saleOriginalPrice(p: Pick<CatalogueProduct, 'price' | 'original_price'>): number | null {
  const original = p.original_price == null ? NaN : Number(p.original_price)
  return Number.isFinite(original) && original > Number(p.price) ? original : null
}

/**
 * Now in the store's time zone, to the minute: "2026-11-07T20:59". It compares
 * as text with a launch moment ("2026-11-07T21:00") and with a bare launch day
 * ("2026-11-07", which counts as midnight), so paymentsState takes either.
 */
export function storeMoment(timeZone = 'Africa/Lagos', now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(now).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** A launch time as staff type it: "21:00" (store time), or null for none (midnight). */
export const launchTime = (v: unknown): string | null => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null)

/** Whether checkout takes payments: not before the store's launch day and time, nor while staff pause the store (lib/checkout). */
export type PaymentsState = {
  open: boolean
  closedFor: 'launch' | 'paused' | null
  opensOn: string | null
  /** The time checkout opens on opensOn (store time, "21:00"), or null for midnight. */
  opensTime: string | null
}

/**
 * The store's switches at a store moment (storeMoment) or on a store day
 * (YYYY-MM-DD, read as its first minute). Checkout opens on paymentsOpenOn at
 * paymentsOpenTime (midnight when it's empty). Before launch wins over a pause: it says when.
 */
export function paymentsState(s: { paymentsOpenOn: string | null; paymentsOpenTime?: string | null; purchasesPaused: boolean }, now: string): PaymentsState {
  const opensOn = s.paymentsOpenOn?.slice(0, 10) ?? null
  const opensTime = launchTime(s.paymentsOpenTime)
  const opening = opensOn && (opensTime ? `${opensOn}T${opensTime}` : opensOn)
  const closedFor = !opening || now < opening ? 'launch' : s.purchasesPaused ? 'paused' : null
  return { open: closedFor == null, closedFor, opensOn, opensTime }
}

/** "9 pm", "9:30 pm" for a launch time. */
export function clockLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`
}

/**
 * When the store opens, in public wording, while no launch day is set. Kept
 * vague on purpose (the videos promise only "November"); every "coming soon"
 * message uses this, so they can't disagree.
 */
export const LAUNCH_WINDOW = 'November'

/** Why checkout isn't taking payments, as a button label and a sentence. */
export function paymentsClosed(p: PaymentsState) {
  if (p.closedFor === 'paused') return { label: 'Purchases paused', message: 'Purchases are paused right now. Please check back soon.' }
  return {
    label: 'Checkout opens at launch',
    message: p.opensOn ? `Checkout opens on ${formatDay(p.opensOn)}${p.opensTime ? ` at ${clockLabel(p.opensTime)}` : ''}.` : `Checkout opens in ${LAUNCH_WINDOW}.`,
  }
}

/** For public catalogue responses: the CDN may serve them a minute old, as checkout always re-prices. */
export const CATALOGUE_CACHE = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' }

/** How long a product counts as New after it's added (owner, 8 Nov 2026). The Studio's New tickbox can end it sooner. */
export const NEW_DAYS = 14

/** True while a product marked New is younger than NEW_DAYS, counted in store days from its creation date. */
export function isStillNew(row: { is_new?: unknown; created_at?: string | null }, today: string) {
  if (!row.is_new || !row.created_at) return false
  const added = Date.parse(String(row.created_at).slice(0, 10))
  const now = Date.parse(today)
  return Number.isFinite(added) && Number.isFinite(now) && now - added < NEW_DAYS * 86_400_000
}

/** The public shape of a product: camelCase, no internal columns, with its purchase state. */
export function toPublicProduct(row: Record<string, any>, today: string) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    price: Number(row.price),
    originalPrice: saleOriginalPrice(row as CatalogueProduct) ?? undefined,
    images: Array.isArray(row.images) ? row.images : [],
    category: row.category,
    isNew: isStillNew(row, today),
    isLimited: Boolean(row.is_limited),
    isTrending: Boolean(row.is_trending),
    membersOnly: Boolean(row.members_only),
    releaseDate: row.release_date ?? undefined,
    rating: row.rating == null ? undefined : Number(row.rating),
    reviews: row.reviews ?? undefined,
    sales: row.sales ?? undefined,
    stock: Math.max(0, Number(row.stock ?? 0)),
    status: row.status,
    colors: stringList(row.colors),
    sizes: stringList(row.sizes),
    tags: stringList(row.tags),
    cardSize: row.card_size ?? undefined,
    createdAt: row.created_at,
    sourceType: row.source_type ?? 'original',
    fulfilment: row.fulfilment ?? 'stock',
    leadTimeDays: row.lead_time_days ?? undefined,
    shipsByAir: row.ships_by_air === false ? false : undefined,
    brand: row.brand ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug } : undefined,
    purchase: purchaseState(row as CatalogueProduct, today),
  }
}

/**
 * Formats a calendar date (YYYY-MM-DD) the same everywhere. Parsing it as a
 * Date would mean midnight UTC, which shows as the previous day west of UTC.
 */
export function formatDay(day: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })
}
