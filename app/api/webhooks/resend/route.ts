import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { handle } from '@/lib/api'
import { logger } from '@/lib/log'
import { parseResendEvent, verifySvix } from '@/lib/email/webhook'

export const dynamic = 'force-dynamic'

const MAX_BODY = 100_000

/**
 * Resend's event webhook (Resend → Webhooks). Nothing is trusted until the Svix
 * signature checks out. A hard bounce or a spam complaint suppresses the
 * address and unsubscribes it (record_email_event, one transaction); other
 * events are recorded for the Studio's campaign stats. Resend retries on
 * non-2xx, and each delivery is keyed by its svix-id, so a retry is a no-op.
 */
export const POST = handle('webhooks.resend', async (req: NextRequest) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })

  const raw = await req.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const svixId = req.headers.get('svix-id')
  const ok = verifySvix({
    headers: { id: svixId, timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') },
    body: raw, secret,
  })
  if (!ok || !svixId) {
    logger.warn('webhooks.resend_signature_rejected', {})
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const event = parseResendEvent(body)
  if (!event) return NextResponse.json({ received: true, ignored: true }) // an event type we don't keep

  const { data, error } = await createSupabaseServiceClient().rpc('record_email_event', {
    p_svix_id: svixId.slice(0, 100), p_message_id: event.messageId, p_type: event.type, p_at: event.at,
    p_payload: event.payload, p_emails: event.suppress?.emails ?? [], p_reason: event.suppress?.reason ?? null,
  })
  if (error) throw error // 500: Resend retries
  if (event.suppress && data) logger.info('email.suppressed', { reason: event.suppress.reason, count: event.suppress.emails.length })
  return NextResponse.json({ received: true, duplicate: data === false })
})
