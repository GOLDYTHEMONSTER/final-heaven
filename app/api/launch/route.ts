import { NextResponse } from 'next/server'
import { handle } from '@/lib/api'
import { CATALOGUE_CACHE, storeToday } from '@/lib/catalog'
import { launchState } from '@/lib/launch'
import { getStorefront } from '@/lib/tenancy'
import { createSupabasePublicClient } from '@/lib/supabase/server'

// Whether the store has opened, and when it will: drives the "coming soon"
// gate and its countdown. Public and tiny, so the CDN serves it a minute old.
export const GET = handle('launch.state', async () => {
  const store = await getStorefront()
  const { data, error } = await createSupabasePublicClient()
    .from('stores').select('payments_open_on, purchases_paused').eq('id', store.storeId).single()
  if (error) throw error
  const state = launchState(
    { paymentsOpenOn: data.payments_open_on ?? null, purchasesPaused: data.purchases_paused === true },
    store.timeZone,
    storeToday(store.timeZone),
  )
  return NextResponse.json(state, { headers: CATALOGUE_CACHE })
})
