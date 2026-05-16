import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const getSupabase = () => createSupabaseServerClient()

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'published'

    const { data, error } = await getSupabase()
      .from('drops')
      .select('*')
      .eq('status', status)
      .order('release_date', { ascending: false })

    if (error) throw error
    return NextResponse.json({ drops: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
