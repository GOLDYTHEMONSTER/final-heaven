import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, readJson } from '@/lib/api'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'
import { NEWSLETTER_CONSENT, WAITLIST_CONSENT } from '@/lib/consent'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const SOURCES: Record<string, string> = { footer: NEWSLETTER_CONSENT, membership_waitlist: WAITLIST_CONSENT }

/**
 * Opt-in sign-up. Requires an explicit consent tick, and stores the exact
 * wording agreed to and when. Someone who unsubscribed and signs up again is
 * re-subscribed with fresh consent.
 */
export const POST = handle('newsletter.subscribe', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'newsletter.subscribe', 5, 600)
  if (limited) return limited

  const body = await readJson(req, 2_000)
  const address = email(body.email)
  if (body.consent !== true) throw new BadRequest('Please tick the box to agree to receive emails.')
  const source = typeof body.source === 'string' && body.source in SOURCES ? body.source : 'footer'
  const store = await getStorefront()

  const { error } = await createSupabaseServiceClient()
    .from('newsletter_subscribers')
    .upsert(
      {
        email: address, source, tenant_id: store.tenantId, store_id: store.storeId,
        consent_text: SOURCES[source], consented_at: new Date().toISOString(), unsubscribed_at: null,
      },
      { onConflict: 'tenant_id,email' }
    )
  if (error) throw error

  // Same reply for new and existing addresses, so this can't be used to check who is subscribed.
  return NextResponse.json({ message: 'Thanks. You’re on the list.' }, { status: 201 })
})
