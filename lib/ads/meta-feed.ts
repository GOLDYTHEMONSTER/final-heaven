// The product catalogue for Meta (Commerce Manager, "Scheduled feed"): a CSV of
// the pieces someone could buy right now. Public product data only; nothing
// about visitors or orders is in it.
//
// Pure: the route supplies the public catalogue and the site address. A piece
// is listed when it is active, in a category that isn't hidden, not members-only
// or paused, not waiting for its release date and either in stock or a pre-order
// with places left (the shared rule is purchaseState in lib/catalog). The price
// is the catalogue's own, in naira with two decimals; there is no separate sale
// price, so an ad never shows a "was" price that the store doesn't.
import { toMinor, fromMinor } from '@/lib/money'
import { canBuy, type Product } from '@/lib/catalog'

export const FEED_COLUMNS = ['id', 'title', 'description', 'availability', 'availability_date', 'condition', 'price', 'link', 'image_link', 'brand', 'custom_label_0'] as const
export type FeedRow = Record<(typeof FEED_COLUMNS)[number], string>

// Meta's limits: titles 200 characters, descriptions 9,999.
const MAX_TITLE = 150
const MAX_DESCRIPTION = 5_000

/** The CDN may keep the feed an hour; Meta fetches it on a schedule, and checkout re-prices anyway. */
export const FEED_CACHE = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }

const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

/** "25000.00 NGN": the price as the catalogue holds it. Throws on a price that isn't a valid amount, so a bad row is never listed. */
export function feedPrice(price: number | string, currency = 'NGN') {
  return `${fromMinor(toMinor(price, currency), currency)} ${currency}`
}

/** Absolute address of a photo, as stored (Meta reads JPEG and PNG, not the WebP copies the storefront serves). */
function photo(url: string, site: string) {
  const src = url.trim()
  return /^https?:\/\//i.test(src) ? src : `${site}${src.startsWith('/') ? '' : '/'}${src}`
}

/**
 * Meta's availability: "preorder" (with the day it ships), "available for order"
 * for pieces made after the order, otherwise "in stock". Sold-out pieces never get here.
 */
function availability(p: Product): Pick<FeedRow, 'availability' | 'availability_date'> {
  const state = p.purchase
  if (state?.state === 'preorder') return { availability: 'preorder', availability_date: state.shipsOn.slice(0, 10) }
  return { availability: p.fulfilment === 'made_to_order' ? 'available for order' : 'in stock', availability_date: '' }
}

/** Marks the piece for Meta's product sets: pre-orders, limited drops, everything else "core". */
export function feedLabel(p: Product) {
  if (p.purchase?.state === 'preorder') return 'preorder'
  return p.isLimited ? 'drop' : 'core'
}

/** One feed row per buyable piece, in the order given. Pieces that can't be listed are left out, never guessed at. */
export function feedRows(products: Product[], { site, hiddenCategories = [], currency = 'NGN' }: { site: string; hiddenCategories?: string[]; currency?: string }): FeedRow[] {
  const base = site.replace(/\/+$/, '')
  const rows: FeedRow[] = []
  for (const p of products) {
    if (p.status !== 'active' || p.membersOnly || hiddenCategories.includes(p.category)) continue
    if (!p.purchase || !canBuy(p.purchase)) continue
    const image = p.images?.find((i) => i?.url)?.url ?? p.image
    if (!image) continue // Meta rejects a listing without a photo
    let price: string
    try {
      price = feedPrice(p.price, currency)
    } catch {
      continue
    }
    if (!(p.price > 0)) continue
    rows.push({
      id: p.id,
      title: flat(p.name).slice(0, MAX_TITLE),
      description: flat(p.description || `${p.name}. ${p.category} from Final Heaven.`).slice(0, MAX_DESCRIPTION),
      ...availability(p),
      condition: 'new',
      price,
      link: `${base}/product/${encodeURIComponent(p.id)}`,
      image_link: photo(image, base),
      brand: 'Final Heaven',
      custom_label_0: feedLabel(p),
    })
  }
  return rows
}

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** The CSV Meta reads: a header row, then one line per piece, CRLF line ends. */
export function feedCsv(rows: FeedRow[]) {
  return [FEED_COLUMNS.join(','), ...rows.map((r) => FEED_COLUMNS.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}
