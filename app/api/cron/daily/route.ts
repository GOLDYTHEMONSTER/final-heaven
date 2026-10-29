import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/payments/flutterwave'
import { paymentDeps } from '@/lib/payments'
import { reconcile } from '@/lib/payments/service'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { handle } from '@/lib/api'
import { logger } from '@/lib/log'
import { sendQueuedEmails } from '@/lib/email'
import { refreshHype } from '@/lib/hype-server'
import { getStorefront } from '@/lib/tenancy'
import { sendLaunchEmail } from '@/lib/email/launch-store'
import { queueProductAlerts } from '@/lib/email/alerts-store'
import { queueOrderFollowups } from '@/lib/email/followups-store'
import { sendStaffDigest } from '@/lib/email/digest-store'

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
 *  2b. Launch email: once stores.payments_open_on has arrived, the launch
 *     waitlist gets one "We're open" email (lib/email/launch). It carries on
 *     over several runs if time or Resend's quota runs out; never twice.
 *  2c. Product alerts ("email me when it's available"): waiting alerts whose
 *     product can now be bought are queued, at most 30 a day, and sent. Not
 *     while checkout is closed.
 *  2d. Delivered follow-up ("How's it fitting?"): orders delivered 3 to 14
 *     days ago get one email, at most 30 a day.
 *  2e. Staff digest: one email a day to STAFF_ALERT_EMAIL summarising the last
 *     24 hours (lib/email/digest); nothing when everything is zero.
 *  3. Retention: expire analytics (13 months), rate-limit windows (2 days),
 *     old analytics salts and the email log (13 months). Financial records
 *     are never touched.
 *  4. Hype: re-score every hyped product, so momentum fades as hypes age
 *     (lib/hype). Skipped quietly where Hype isn't set up.
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
    result.launchEmail = await sendLaunchEmail(await getStorefront(), started + 25_000)
  } catch (error) {
    result.launchEmail = { error: (error as Error).message }
    logger.error('cron.launch_email_failed', { error })
  }
  try {
    result.alerts = await queueProductAlerts(await getStorefront())
  } catch (error) {
    result.alerts = { error: (error as Error).message }
    logger.error('cron.alerts_failed', { error })
  }
  try {
    result.followups = await queueOrderFollowups(await getStorefront())
  } catch (error) {
    result.followups = { error: (error as Error).message }
    logger.error('cron.followups_failed', { error })
  }
  // Delivers what the alert step just queued (and anything else waiting), within the time left.
  result.alertEmails = await sendQueuedEmails(60, { deadline: started + 50_000 })
  try {
    result.digest = await sendStaffDigest(await getStorefront()) // after every send above, so their failures are in it
  } catch (error) {
    result.digest = { error: (error as Error).message }
    logger.error('cron.digest_failed', { error })
  }
  try {
    const { data, error } = await createSupabaseServiceClient().rpc('run_retention')
    if (error) throw error
    result.retention = data
  } catch (error) {
    result.retention = { error: (error as Error).message }
    logger.error('cron.retention_failed', { error })
  }

  try {
    result.hype = await refreshHype()
  } catch (error) {
    result.hype = { error: (error as Error).message }
    logger.warn('cron.hype_failed', { error })
  }

  await audit({ tenantId: null, action: 'job.daily_completed', actor: { type: 'job' }, metadata: { ...result, ms: Date.now() - started } })
  return NextResponse.json(result)
})
