import 'server-only'
import { createHmac, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { hypeRank, hypeScore, isRank, type Rank } from '@/lib/hype'

// Hype on the server: the anonymous visitor key, recording a hype and keeping
// scores current. The visitor is a random id in a first-party cookie, set only
// when someone taps Hype; the database only ever sees a keyed hash of it.

export const VISITOR_COOKIE = 'fh_hv'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The cookie's visitor id if it's well formed, or a new one. */
export function visitorId(cookie: string | undefined) {
  return cookie && UUID.test(cookie) ? { id: cookie, fresh: false } : { id: randomUUID(), fresh: true }
}

/** A keyed hash, so the stored value can't be turned back into the cookie or matched across sites. */
export function visitorHash(id: string) {
  const key = process.env.HYPE_SECRET || process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHmac('sha256', key).update(`hype:${id}`).digest('hex')
}

export type HypeView = { score: number; rank: Rank; early: boolean; hypes: number }

/** Whether Hype is on for a store. False when it's off, or not set up in this database yet. */
export async function hypeEnabled(storeId: string, db: SupabaseClient = createSupabaseServiceClient()) {
  const { data, error } = await db.from('hype_settings').select('enabled').eq('store_id', storeId).maybeSingle()
  return !error && data?.enabled === true
}

/** Works out and saves a product's score and rank from its counts. */
async function save(db: SupabaseClient, productId: string, tenantId: string, c: { total: number; last7: number; rank: unknown; rank_since: string | null }) {
  const score = hypeScore({ total: Number(c.total), last7: Number(c.last7) })
  const previous: Rank = isRank(c.rank) ? c.rank : 'unseen'
  const { rank, early } = hypeRank(score, Number(c.total), previous, c.rank_since ? new Date(c.rank_since) : null)
  const { error } = await db.rpc('save_hype', { p_product: productId, p_tenant: tenantId, p: { score, rank, early, total: Number(c.total), last7: Number(c.last7) } })
  if (error) throw error
  return { score, rank, early, hypes: Number(c.total), previous }
}

export type HypeResult =
  | { status: 'off' | 'unknown_product' }
  | ({ status: 'accepted' | 'duplicate'; rankedUp: boolean } & HypeView)

/** Records a visitor's hype and, if it counted, updates the product's score. */
export async function recordHype(storeId: string, productId: string, visitor: string): Promise<HypeResult> {
  const db = createSupabaseServiceClient()
  const { data, error } = await db.rpc('record_hype', { p_store: storeId, p_product: productId, p_visitor: visitorHash(visitor) })
  if (error) throw error
  const r = data as { status: string; tenant_id: string; total: number; last7: number; rank: string; rank_since: string | null }
  if (r.status === 'off' || r.status === 'unknown_product') return { status: r.status }
  if (r.status === 'duplicate') {
    const current = (await scores(storeId, [productId]))[productId]
    return { status: 'duplicate', rankedUp: false, ...(current ?? { score: 0, rank: 'unseen', early: false, hypes: Number(r.total) }) }
  }
  const saved = await save(db, productId, r.tenant_id, r)
  const order = ['unseen', 'emerging', 'buzzing', 'trending', 'elite', 'iconic', 'legendary']
  return { status: 'accepted', score: saved.score, rank: saved.rank, early: saved.early, hypes: saved.hypes, rankedUp: order.indexOf(saved.rank) > order.indexOf(saved.previous) }
}

/** Scores for some of a store's products (only those with hypes appear). */
export async function scores(storeId: string, ids: string[], db: SupabaseClient = createSupabaseServiceClient()): Promise<Record<string, HypeView>> {
  if (!ids.length) return {}
  const { data, error } = await db.from('product_hype').select('product_id, score, rank, early, hypes, products!inner(store_id)')
    .in('product_id', ids).eq('products.store_id', storeId)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((h: any) => [h.product_id, { score: Number(h.score), rank: h.rank, early: h.early, hypes: h.hypes }]))
}

/** Which of these products this visitor has hyped. */
export async function hypedBy(visitor: string, ids: string[], db: SupabaseClient = createSupabaseServiceClient()) {
  if (!ids.length) return []
  const { data, error } = await db.from('hype_events').select('product_id').eq('visitor_hash', visitorHash(visitor)).in('product_id', ids)
  if (error) throw error
  return (data ?? []).map((e) => e.product_id as string)
}

/** The daily refresh: momentum fades as hypes age, so every hyped product is re-scored. */
export async function refreshHype() {
  const db = createSupabaseServiceClient()
  const { data, error } = await db.rpc('hype_counts')
  if (error) throw error
  let updated = 0
  for (const c of (data ?? []) as { product_id: string; tenant_id: string; total: number; last7: number; rank: string | null; rank_since: string | null }[]) {
    await save(db, c.product_id, c.tenant_id, c)
    updated += 1
  }
  return { updated }
}
