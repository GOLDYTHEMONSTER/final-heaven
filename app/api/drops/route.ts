import { NextResponse } from 'next/server'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import { handle } from '@/lib/api'

// Cached briefly at the edge; newly published drops appear within a minute.
export const revalidate = 60

// Public: published drops only. Drafts and scheduled drops stay private (RLS enforces this too).
export const GET = handle('drops.list', async () => {
  const { data, error } = await createSupabasePublicClient()
    .from('drops')
    .select('*')
    .eq('status', 'published')
    .order('release_date', { ascending: false })
  if (error) throw error
  return NextResponse.json({ drops: data || [] })
})
