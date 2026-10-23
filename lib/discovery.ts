// Discovery ranking: orders products for the homepage feed, the shop's
// "Featured" sort and related products. Pure and deterministic for a given
// seed, so it runs the same on the server (/api/feed) and in the browser,
// and is unit-tested. Rule-based on purpose: every factor is a named weight.

import type { Product } from '@/lib/catalog'

/** What we know about a shopper's taste. Built in the browser from the local interest store; never stored server-side. */
export type FeedProfile = {
  /** Category -> affinity (any positive scale; normalised against the strongest). */
  categories: Record<string, number>
  /** Tag -> affinity, same scale rules. */
  tags: Record<string, number>
  /** Categories the shopper picked in "What are you into?". */
  picked: string[]
  /** Products the shopper has already opened, most recent last. */
  viewed: string[]
}

export const EMPTY_PROFILE: FeedProfile = { categories: {}, tags: {}, picked: [], viewed: [] }

/** Every factor in one place, so the balance between them can be tuned. */
export const FEED_WEIGHTS = {
  /** Matches the categories the shopper browses. */
  category: 3,
  /** Category the shopper picked explicitly. */
  picked: 2.5,
  /** Shares style tags with what the shopper browses. */
  tags: 1.5,
  /** Marked new by the store. */
  isNew: 1.2,
  /** Added in the last RECENT_DAYS, fading with age. */
  recent: 0.8,
  /** Not opened yet, so the feed keeps showing something fresh. */
  unseen: 0.6,
  /** Can be bought now (or pre-ordered). */
  buyable: 1,
  /** Sold out or unavailable: still discoverable, but after everything buyable. */
  blocked: -6,
  /** Seeded random lift, so equal scores don't always fall the same way. */
  explore: 0.9,
  /** Penalty per same-category item among the last DIVERSITY_WINDOW picks. */
  sameCategory: 1.4,
} as const

const RECENT_DAYS = 60
const DIVERSITY_WINDOW = 3

/** A stable 0..1 value for a seed and an id (FNV-1a, then scaled). */
export function jitter(seed: number, id: string) {
  let h = 2166136261 ^ seed
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}

const normalise = (m: Record<string, number>) => {
  const max = Math.max(0, ...Object.values(m))
  return (k: string) => (max > 0 ? Math.max(0, m[k] ?? 0) / max : 0)
}

/** How well one product fits the profile, before diversity. Higher is better. */
export function scoreProduct(p: Product, profile: FeedProfile, seed: number, now = Date.now()) {
  const w = FEED_WEIGHTS
  const cat = normalise(profile.categories)
  const tag = normalise(profile.tags)
  const tags = p.tags ?? []

  let score = w.category * cat(p.category)
  if (profile.picked.includes(p.category)) score += w.picked
  if (tags.length) score += w.tags * Math.min(1, tags.reduce((s, t) => s + tag(t), 0) / 2)
  if (p.isNew) score += w.isNew
  if (p.createdAt) {
    const days = (now - Date.parse(p.createdAt)) / 86_400_000
    if (days >= 0 && days < RECENT_DAYS) score += w.recent * (1 - days / RECENT_DAYS)
  }
  if (!profile.viewed.includes(p.id)) score += w.unseen
  const state = p.purchase?.state
  if (state === 'available' || state === 'preorder') score += w.buyable
  else if (state === 'sold_out' || state === 'unavailable') score += w.blocked
  return score + w.explore * jitter(seed, p.id)
}

export type RankOptions = {
  seed: number
  /** Ids already shown in this session: never returned again. */
  exclude?: Iterable<string>
  /** Categories of the last few items already shown, so diversity carries across pages. */
  tail?: string[]
  limit?: number
  now?: number
}

/**
 * Orders products by score, then picks greedily so the same category doesn't
 * run on: each pick pays a penalty for every same-category item among the
 * last few. Excluded ids are skipped, so successive pages never repeat.
 */
export function rankProducts(products: Product[], profile: FeedProfile, opts: RankOptions): Product[] {
  const exclude = new Set(opts.exclude ?? [])
  const pool = products
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({ p, s: scoreProduct(p, profile, opts.seed, opts.now) }))
  const limit = Math.min(opts.limit ?? pool.length, pool.length)
  const recent = [...(opts.tail ?? [])].slice(-DIVERSITY_WINDOW)
  const out: Product[] = []

  while (out.length < limit) {
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const same = recent.filter((c) => c === pool[i].p.category).length
      const s = pool[i].s - FEED_WEIGHTS.sameCategory * same
      if (s > bestScore || (s === bestScore && pool[i].p.id < pool[best].p.id)) { best = i; bestScore = s }
    }
    const [{ p }] = pool.splice(best, 1)
    out.push(p)
    recent.push(p.category)
    if (recent.length > DIVERSITY_WINDOW) recent.shift()
  }
  return out
}

/** The shape of the browser's interest store that a profile is built from. */
export type InterestSignals = {
  viewedProducts: { productId: string; category: string; tags: string[]; viewedAt: number }[]
  favoritedCategories: string[]
  cartAdditions: string[]
  pickedCategories?: string[]
}

/**
 * Turns browsing history into a compact profile. Recent views count more
 * (half-life a week); a category opened often counts more; favourite
 * categories (from browsing a category) add a little.
 */
export function buildProfile(s: InterestSignals, now = Date.now()): FeedProfile {
  const categories: Record<string, number> = {}
  const tags: Record<string, number> = {}
  for (const v of s.viewedProducts.slice(-50)) {
    const weight = Math.pow(0.5, Math.max(0, now - v.viewedAt) / (7 * 86_400_000))
    categories[v.category] = (categories[v.category] ?? 0) + weight
    for (const t of v.tags ?? []) tags[t] = (tags[t] ?? 0) + weight
  }
  for (const c of s.favoritedCategories) categories[c] = (categories[c] ?? 0) + 0.5
  const top = (m: Record<string, number>, n: number) =>
    Object.fromEntries(Object.entries(m).sort(([, a], [, b]) => b - a).slice(0, n).map(([k, v]) => [k, +v.toFixed(3)]))
  return {
    categories: top(categories, 12),
    tags: top(tags, 16),
    picked: (s.pickedCategories ?? []).slice(0, 12),
    viewed: s.viewedProducts.slice(-30).map((v) => v.productId),
  }
}
