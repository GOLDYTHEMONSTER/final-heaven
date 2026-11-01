import 'server-only'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import type { StoreContext } from '@/lib/tenancy'
import { createResendSender } from './resend'
import { emailConfigFromEnv } from './index'
import { MARKETING_DAILY } from './budget'
import { drainApprovedBatches, type DrainResult } from './batches-store'

/**
 * The daily job's send step for approved batches: as many as fit before the
 * deadline and the marketing budget allow, oldest approval first. Runs after
 * all service mail has been sent. What doesn't fit waits (the Outbox page also
 * carries on while it is open).
 */
export async function drainMarketing(store: StoreContext, deadline: number): Promise<DrainResult | { state: 'not_configured' }> {
  const config = emailConfigFromEnv()
  const apiKey = process.env.RESEND_API_KEY
  if (!config || !apiKey) return { state: 'not_configured' }
  return drainApprovedBatches(
    { db: createSupabaseServiceClient(), sender: createResendSender({ apiKey }), from: config.from, replyTo: config.replyTo, site: config.siteUrl, tenantId: store.tenantId },
    { limit: MARKETING_DAILY, deadline },
  )
}
