import 'server-only'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import { HttpError } from '@/lib/api'

export type StoreContext = { tenantId: string; storeId: string; storeSlug: string; currency: string }

let cached: { value: StoreContext; at: number } | null = null
const TTL_MS = 5 * 60_000

/**
 * The storefront this deployment serves, resolved on the server from
 * configuration (STOREFRONT_SLUG), never from anything the browser sends.
 * Every public read and every order is scoped to it.
 */
export async function getStorefront(): Promise<StoreContext> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  const slug = process.env.STOREFRONT_SLUG || 'final-heaven'
  const { data, error } = await createSupabasePublicClient()
    .from('stores')
    .select('id, tenant_id, slug, currency')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(503, 'This store is not available right now.')
  const value = { tenantId: data.tenant_id, storeId: data.id, storeSlug: data.slug, currency: data.currency }
  cached = { value, at: Date.now() }
  return value
}
