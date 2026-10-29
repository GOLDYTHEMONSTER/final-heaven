import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { handle, readJson } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One-click unsubscribe from the link in our emails. The token identifies the
 * subscription; nobody needs to sign in. Same reply whether or not the token
 * matched, so it can't be used to test tokens.
 */
export const POST = handle('newsletter.unsubscribe', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'newsletter.unsubscribe', 20, 600)
  if (limited) return limited

  // Mail apps' own unsubscribe button (RFC 8058) POSTs the List-Unsubscribe
  // address, token in the query, with a form body; the /unsubscribe page sends JSON.
  const fromQuery = req.nextUrl.searchParams.get('token')
  const body = fromQuery ? {} : await readJson(req, 500)
  const token = (fromQuery ?? (typeof body.token === 'string' ? body.token : '')).trim()
  if (UUID.test(token)) {
    const { error } = await createSupabaseServiceClient().rpc('newsletter_unsubscribe', { p_token: token })
    if (error) throw error
  }
  return NextResponse.json({ message: 'You’ve been unsubscribed. You won’t receive further marketing emails from us.' })
})
