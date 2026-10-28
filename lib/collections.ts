// Collections: curated groups of products ("shop by mood", drops, labels).
// A collection is a hand-picked list (collection_products, in order) plus an
// optional rule matched against the catalogue. Products are never copied; the
// same product can sit in many collections. Pure: callers pass the products.
import type { Product } from '@/lib/catalog'

/** Where a product comes from. Final Heaven sells new products only. */
export const SOURCE_TYPES = ['original', 'wholesale', 'independent', 'distributor', 'local_maker'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

/** How it's supplied: ready to ship from stock, or made after the order (pre-orders have their own fields). */
export const FULFILMENTS = ['stock', 'made_to_order'] as const
export type Fulfilment = (typeof FULFILMENTS)[number]

/** A URL-safe slug from a name: "Lagos Label Co." -> "lagos-label-co". */
export function slugify(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

/** How a product's origin reads to a shopper; how bought-in stock was sourced is never shown. */
export function sourceLabel(p: Pick<Product, 'sourceType' | 'brand'>): string | null {
  if (p.sourceType === 'original') return 'Final Heaven Original'
  if (p.sourceType === 'independent') return p.brand ? p.brand.name : 'Independent label'
  return null
}

/**
 * Supplied after the order and bought in (wholesale, distributor): we order it
 * in for the customer rather than making it, so it must never read "made to order".
 */
export const orderedIn = (p: Pick<Product, 'fulfilment' | 'sourceType'>) =>
  p.fulfilment === 'made_to_order' && (p.sourceType === 'wholesale' || p.sourceType === 'distributor')

/** "Made to order · ships in about N days", or "Ordered in · …" for bought-in pieces; null for stock. */
export function supplyLabel(p: Pick<Product, 'fulfilment' | 'leadTimeDays' | 'sourceType'>): string | null {
  if (p.fulfilment !== 'made_to_order') return null
  const kind = orderedIn(p) ? 'Ordered in' : 'Made to order'
  return p.leadTimeDays ? `${kind} · ships in about ${p.leadTimeDays} days` : kind
}

/** The sentence under it on the product page: what happens after payment. */
export function supplyNote(p: Pick<Product, 'fulfilment' | 'leadTimeDays' | 'sourceType'>): string | null {
  if (p.fulfilment !== 'made_to_order') return null
  const when = p.leadTimeDays ? `, so it ships about ${p.leadTimeDays} days after payment` : ''
  return orderedIn(p)
    ? `We order this in for you once you’ve paid${when}. It doesn’t ship straight away.`
    : `We make this after you order${when}. It doesn’t ship straight away.`
}

/** The rule part of a collection: every condition given must hold. */
export type CollectionRule = {
  categories?: string[]
  sources?: SourceType[]
  tags?: string[]
  minPrice?: number
  maxPrice?: number
  brandId?: string
  /** Only products marked new. */
  newOnly?: boolean
}

const strings = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '' && x.length <= 60).slice(0, max) : undefined
const price = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100_000_000 ? v : undefined)

/** A rule from a database row or a request body; unknown keys and bad values are dropped. null = no rule. */
export function parseRule(value: unknown): CollectionRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const rule: CollectionRule = {
    categories: strings(v.categories, 20),
    sources: strings(v.sources, 5)?.filter((s): s is SourceType => (SOURCE_TYPES as readonly string[]).includes(s)),
    tags: strings(v.tags, 20)?.map((t) => t.toLowerCase()),
    minPrice: price(v.minPrice),
    maxPrice: price(v.maxPrice),
    brandId: typeof v.brandId === 'string' && /^[0-9a-f-]{36}$/i.test(v.brandId) ? v.brandId : undefined,
    newOnly: v.newOnly === true ? true : undefined,
  }
  const clean = Object.fromEntries(Object.entries(rule).filter(([, x]) => x !== undefined && !(Array.isArray(x) && x.length === 0)))
  return Object.keys(clean).length ? (clean as CollectionRule) : null
}

export function matchesRule(p: Product, rule: CollectionRule): boolean {
  if (rule.categories && !rule.categories.includes(p.category)) return false
  if (rule.sources && !rule.sources.includes((p.sourceType ?? 'original') as SourceType)) return false
  if (rule.tags && !(p.tags ?? []).some((t) => rule.tags!.includes(t.toLowerCase()))) return false
  if (rule.minPrice != null && p.price < rule.minPrice) return false
  if (rule.maxPrice != null && p.price > rule.maxPrice) return false
  if (rule.brandId && p.brand?.id !== rule.brandId) return false
  if (rule.newOnly && !p.isNew) return false
  return true
}

/**
 * A collection's products: the hand-picked ones first, in their order, then
 * the rule's matches, newest first. Each product once. `products` should be
 * what the public may see (the caller's query already applies that).
 */
export function collectionProducts(products: Product[], picked: { productId: string; position: number }[], rule: CollectionRule | null): Product[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const out: Product[] = []
  const seen = new Set<string>()
  for (const { productId } of [...picked].sort((a, b) => a.position - b.position)) {
    const p = byId.get(productId)
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p) }
  }
  if (rule) {
    const matches = products.filter((p) => !seen.has(p.id) && matchesRule(p, rule))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    out.push(...matches)
  }
  return out
}
