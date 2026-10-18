import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/payments/flutterwave'
import { paymentDeps } from '@/lib/payments'
import { reconcile } from '@/lib/payments/service'
import { audit } from '@/lib/audit'
import { handle } from '@/lib/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Payment reconciliation: retries webhook events that failed to process and
 * asks Flutterwave about payments still open after 10 minutes, so a missed
 * webhook can't lose a payment. Scheduled in vercel.json; Vercel sends
 * `Authorization: Bearer $CRON_SECRET`.
 */
export const GET = handle('cron.payments', async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET
  const got = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!secret || !safeEqual(got, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const started = Date.now()
  const summary = await reconcile(paymentDeps())
  await audit({
    tenantId: null, action: 'job.payments_reconciled', actor: { type: 'job' },
    metadata: { ...summary, ms: Date.now() - started },
  })
  return NextResponse.json(summary)
})
