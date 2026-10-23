import { NextResponse } from 'next/server'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import { BadRequest, handle, readJson } from '@/lib/api'
import { getStorefront } from '@/lib/tenancy'
import { storeToday, toPublicProduct } from '@/lib/catalog'
import { EMPTY_PROFILE, rankProducts, type FeedProfile } from '@/lib/discovery'

// Per-request: the order depends on the shopper's profile and what they've already seen.
export const dynamic = 'force-dynamic'

const MAX_BATCH = 24

const strings = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 120).slice(0, max) : []

const weights = (v: unknown, max: number) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([k, n]) => k.length <= 60 && typeof n === 'number' && Number.isFinite(n) && n > 0)
      .slice(0, max) as [string, number][],
  )
}

/**
 * The next batch of the discovery feed. The browser sends its own taste
 * profile (built from its local interest store) and the ids it has already
 * shown; nothing is stored. Active products only, ranked by lib/discovery,
 * so the feed never repeats a product and ends when the catalogue runs out.
 */
export const POST = handle('feed.next', async (req: Request) => {
  const body = await readJson(req, 16_000)
  const seed = Number(body.seed)
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 31) throw new BadRequest('A numeric seed is required.')
  const limit = Math.min(MAX_BATCH, Math.max(1, Number(body.limit) || 12))
  const exclude = strings(body.exclude, 500)
  const tail = strings(body.tail, 3)
  const raw = (body.profile ?? {}) as Record<string, unknown>
  const profile: FeedProfile = {
    ...EMPTY_PROFILE,
    categories: weights(raw.categories, 12),
    tags: weights(raw.tags, 16),
    picked: strings(raw.picked, 12),
    viewed: strings(raw.viewed, 30),
  }

  const store = await getStorefront()
  const { data, error } = await createSupabasePublicClient()
    .from('products').select('*').eq('store_id', store.storeId).eq('status', 'active')
    .order('created_at', { ascending: false }).limit(500)
  if (error) throw error

  const today = storeToday(store.timeZone)
  const all = (data || []).map((p) => toPublicProduct(p, today))
  const products = rankProducts(all, profile, { seed, exclude, tail, limit })
  const remaining = all.length - new Set([...exclude, ...products.map((p) => p.id)]).size

  return NextResponse.json({
    products,
    done: remaining <= 0,
    // Categories that actually have products, for the optional "What are you into?" picker.
    categories: Array.from(new Set(all.map((p) => p.category))).sort(),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
