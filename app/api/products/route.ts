import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const getSupabase = () => createSupabaseServerClient()

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const isNew = url.searchParams.get('isNew')
    const category = url.searchParams.get('category')
    const status = url.searchParams.get('status') || 'active'

    let query = getSupabase().from('products').select('*')

    if (status) {
      query = query.eq('status', status)
    }
    if (isNew === 'true') {
      query = query.eq('is_new', true)
    }
    if (category && category !== 'All') {
      query = query.eq('category', category)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ products: data || [] })
  } catch (error: any) {
    if (error?.code === 'PGRST116') {
      return NextResponse.json(
        { error: "Supabase table 'public.products' was not found. Apply the schema from supabase/schema.sql to your database." },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
