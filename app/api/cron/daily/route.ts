import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/payments/flutterwave'
import { paymentDeps } from '@/lib/payments'
import { reconcile } from '@/lib/payments/service'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { handle } from '@/lib/api'
import { logger } from '@/lib/log'
import { sendQueuedEmails } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Daily maintenance, scheduled in vercel.json. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`. Each step is idempotent and safe to
 * re-run; one step failing doesn't stop the others.
 *  1. Payment reconciliation: retry failed webhook events, ask Flutterwave
 *     about payments still open, abandon ones it never saw after 24h.
 *  2. Email catch-up: send anything still queued (e.g. after a Resend outage
 *     or the daily quota), up to 50.
 *  3. Retention: expire analytics (13 months), rate-limit windows (2 days),
 *     old analytics salts and the email log (13 months). Financial records
 *     are never touched.
 */
export const GET = handle('cron.daily', async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET
  const got = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!secret || !safeEqual(got, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const started = Date.now()
  const result: Record<string, unknown> = {}

  try {
    result.payments = await reconcile(paymentDeps())
  } catch (error) {
    result.payments = { error: (error as Error).message }
    logger.error('cron.reconcile_failed', { error })
  }
  result.emails = await sendQueuedEmails(50)
  try {
    const { data, error } = await createSupabaseServiceClient().rpc('run_retention')
    if (error) throw error
    result.retention = data
  } catch (error) {
    result.retention = { error: (error as Error).message }
    logger.error('cron.retention_failed', { error })
  }

  await audit({ tenantId: null, action: 'job.daily_completed', actor: { type: 'job' }, metadata: { ...result, ms: Date.now() - started } })
  return NextResponse.json(result)
})
