import { NextResponse } from 'next/server'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import { handle } from '@/lib/api'
import { getStorefront } from '@/lib/tenancy'

// Public catalogue: only active products, whatever the query string says.
// RLS enforces the same rule in the database.
export const GET = handle('products.list', async (req: Request) => {
  const params = new URL(req.url).searchParams
  const category = params.get('category')

  const store = await getStorefront()
  let query = createSupabasePublicClient().from('products').select('*').eq('store_id', store.storeId).eq('status', 'active')
  if (params.get('isNew') === 'true') query = query.eq('is_new', true)
  if (category && category !== 'All') query = query.eq('category', category.slice(0, 60))

  const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
  if (error) throw error

  return NextResponse.json({ products: data || [] })
})
