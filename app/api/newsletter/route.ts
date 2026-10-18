import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { email, handle, readJson } from '@/lib/api'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

export const POST = handle('newsletter.subscribe', async (req: NextRequest) => {
  const body = await readJson(req, 2_000)
  const address = email(body.email)

  const { error } = await createSupabaseServiceClient()
    .from('newsletter_subscribers')
    .upsert({ email: address, source: 'footer' }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) throw error

  // Same reply for new and existing addresses, so this can't be used to check who is subscribed.
  return NextResponse.json({ message: 'Thanks. You’re on the list.' }, { status: 201 })
})
