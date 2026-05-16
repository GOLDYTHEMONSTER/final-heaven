import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const getSupabase = () => createSupabaseServerClient()

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { data, error } = await getSupabase()
      .from('products')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ product: null }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ product: data })
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
