// Whether and how a product can be bought, decided in one place for the
// storefront (what the button says) and checkout (what the server accepts).
// Pure: the caller supplies the store's local date.

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
  release_date?: string | null
  preorder?: boolean | null
  preorder_ships_on?: string | null
  preorder_limit?: number | null
  sizes?: unknown
  colors?: unknown
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
  /** From the server: whether and how this can be bought right now. */
  purchase?: PurchaseState
}

export type PurchaseState =
  | { state: 'available'; maxQuantity: number }
  | { state: 'preorder'; shipsOn: string; maxQuantity: number }
  | { state: 'sold_out' }
  | { state: 'coming_soon'; releaseDate: string }
  | { state: 'members_only' }
  | { state: 'unavailable' }

export function purchaseState(p: CatalogueProduct, today: string): PurchaseState {
  if (p.status !== 'active') return { state: 'unavailable' }
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
    default: return `${name} is no longer available.`
  }
}

/** Today's date (YYYY-MM-DD) in the store's time zone. */
export function storeToday(timeZone = 'Africa/Lagos', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

/** A sale is shown only when the original price is genuinely higher. */
export function saleOriginalPrice(p: Pick<CatalogueProduct, 'price' | 'original_price'>): number | null {
  const original = p.original_price == null ? NaN : Number(p.original_price)
  return Number.isFinite(original) && original > Number(p.price) ? original : null
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
    isNew: Boolean(row.is_new),
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
