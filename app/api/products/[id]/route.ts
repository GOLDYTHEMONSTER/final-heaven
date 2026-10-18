import { NextResponse } from 'next/server'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import { handle } from '@/lib/api'
import { getStorefront } from '@/lib/tenancy'
import { storeToday, toPublicProduct } from '@/lib/catalog'

export const GET = handle('products.get', async (_req: Request, { params }: { params: { id: string } }) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.id)) {
    return NextResponse.json({ product: null }, { status: 404 })
  }

  const store = await getStorefront()
  const { data, error } = await createSupabasePublicClient()
    .from('products')
    .select('*')
    .eq('store_id', store.storeId)
    .eq('id', params.id)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ product: null }, { status: 404 })

  return NextResponse.json({ product: toPublicProduct(data, storeToday(store.timeZone)) })
})
