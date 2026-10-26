// Collections: curated groups of products ("shop by mood", drops, labels).
// A collection is a hand-picked list (collection_products, in order) plus an
// optional rule matched against the catalogue. Products are never copied; the
// same product can sit in many collections. Pure: callers pass the products.
import type { Product } from '@/lib/catalog'

export const SOURCE_TYPES = ['original', 'thrift', 'wholesale', 'independent', 'consignment'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const CONDITIONS = ['new_with_tags', 'new_without_tags', 'excellent', 'good', 'fair'] as const
export type Condition = (typeof CONDITIONS)[number]

/** How a condition reads to a shopper. */
export const CONDITION_LABELS: Record<Condition, string> = {
  new_with_tags: 'New with tags',
  new_without_tags: 'New without tags',
  excellent: 'Pre-owned, excellent',
  good: 'Pre-owned, good',
  fair: 'Pre-owned, fair',
}

/** How a product's origin reads to a shopper; wholesale and consignment say nothing of how they were bought. */
export function sourceLabel(p: Pick<Product, 'sourceType' | 'brand'>): string | null {
  if (p.sourceType === 'original') return 'Final Heaven Original'
  if (p.sourceType === 'thrift') return 'Thrift find'
  if (p.sourceType === 'independent') return p.brand ? p.brand.name : 'Independent label'
  return null
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
