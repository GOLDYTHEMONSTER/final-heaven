import { NextResponse } from 'next/server'
import { handle } from '@/lib/api'
import { CATALOGUE_CACHE, storeMoment } from '@/lib/catalog'
import { launchState } from '@/lib/launch'
import { getStorefront } from '@/lib/tenancy'
import { createSupabasePublicClient } from '@/lib/supabase/server'

// Whether the store has opened, and when it will: drives the "coming soon"
// gate and its countdown. Public and tiny, so the CDN serves it a minute old.
export const GET = handle('launch.state', async () => {
  const store = await getStorefront()
  const { data, error } = await createSupabasePublicClient()
    .from('stores').select('payments_open_on, payments_open_time, purchases_paused').eq('id', store.storeId).single()
  if (error) throw error
  const state = launchState(
    { paymentsOpenOn: data.payments_open_on ?? null, paymentsOpenTime: data.payments_open_time ?? null, purchasesPaused: data.purchases_paused === true },
    store.timeZone,
    storeMoment(store.timeZone),
  )
  // Within ten minutes of opening, the CDN may keep it only seconds: at the launch
  // moment, the gate and the countdown must not show "closed" from a stale copy.
  const soon = state.opensAt != null && new Date(state.opensAt).getTime() - Date.now() < 10 * 60_000
  return NextResponse.json(state, { headers: soon ? { 'Cache-Control': 'public, s-maxage=5' } : CATALOGUE_CACHE })
})
