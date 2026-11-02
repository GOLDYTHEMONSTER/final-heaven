import { NextRequest, NextResponse } from 'next/server'
import { paymentDeps } from '@/lib/payments'
import { handleWebhook } from '@/lib/payments/service'
import { handle } from '@/lib/api'
import { sendQueuedEmails } from '@/lib/email'

export const dynamic = 'force-dynamic'
// Calls Flutterwave (15 s timeout) and may send emails: room to finish, never left hanging by the platform default.
export const maxDuration = 30

/**
 * Flutterwave webhook. No browser session exists here: authenticity comes
 * from the `verif-hash` header, and the tenant is resolved from our own
 * payment reference after re-verifying the transaction with Flutterwave.
 * Configure in the Flutterwave dashboard: URL {SITE_URL}/api/webhooks/flutterwave,
 * secret hash = FLW_SECRET_HASH, retries on.
 */
export const POST = handle('webhooks.flutterwave', async (req: NextRequest) => {
  const started = Date.now()
  const raw = await req.text()
  if (raw.length > 256_000) return NextResponse.json({ error: 'payload too large' }, { status: 413 })
  const result = await handleWebhook(paymentDeps(), req.headers, raw)
  if (result.httpStatus === 200 && !result.body.duplicate) await sendQueuedEmails(5, { deadline: started + 20_000 })
  return NextResponse.json(result.body, { status: result.httpStatus })
})
