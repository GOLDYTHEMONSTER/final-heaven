import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { emailConfigFromEnv } from '@/lib/email'
import { createResendSender } from '@/lib/email/resend'
import { BATCH } from '@/lib/email/campaign-send'
import { drainApprovedBatches } from '@/lib/email/batches-store'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Sends the next small step of the approved batches (oldest approval first,
 * within the day's marketing budget). The Outbox page calls it again until
 * `remaining` is 0 or it reports a pause.
 */
export const POST = handle('admin.outbox.drain', async () => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  const config = emailConfigFromEnv()
  if (!config || !process.env.RESEND_API_KEY) return NextResponse.json({ error: 'Email isn’t set up yet: add RESEND_API_KEY and EMAIL_FROM in Vercel.' }, { status: 503 })
  const progress = await drainApprovedBatches(
    { db: createSupabaseServiceClient(), sender: createResendSender({ apiKey: process.env.RESEND_API_KEY }), from: config.from, replyTo: config.replyTo, site: config.siteUrl, tenantId: staff.tenant.tenantId },
    { limit: BATCH },
  )
  return NextResponse.json({ progress })
})
