import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { storeToday } from '@/lib/catalog'
import type { StoreContext } from '@/lib/tenancy'
import { createResendSender } from './resend'
import { emailConfigFromEnv } from './index'
import { sendCampaignStep } from './campaign-send'
import { runLaunchEmail, type LaunchResult, type LaunchStore } from './launch'

export function supabaseLaunchStore(storeId: string, db: SupabaseClient = createSupabaseServiceClient()): LaunchStore {
  return {
    async state() {
      const { data, error } = await db.from('stores')
        .select('payments_open_on, purchases_paused, launch_campaign_id, launch_email_sent_at').eq('id', storeId).single()
      if (error) throw error
      return {
        paymentsOpenOn: data.payments_open_on ?? null, purchasesPaused: data.purchases_paused === true,
        campaignId: data.launch_campaign_id ?? null, sentAt: data.launch_email_sent_at ?? null,
      }
    },
    async ensureCampaign(c) {
      const { data, error } = await db.rpc('ensure_launch_campaign', {
        p_store: storeId, p_subject: c.subject, p_preheader: c.preheader, p_heading: c.heading, p_body: c.body,
        p_cta_label: c.ctaLabel, p_cta_url: c.ctaUrl,
      })
      if (error) throw error
      return data as string
    },
    async markSent() {
      const { error } = await db.from('stores').update({ launch_email_sent_at: new Date().toISOString() }).eq('id', storeId).is('launch_email_sent_at', null)
      if (error) throw error
    },
  }
}

/** The daily job's launch step: sends the launch email to the waitlist once the store has opened. */
export async function sendLaunchEmail(store: StoreContext, deadline: number): Promise<LaunchResult | { state: 'not_configured' }> {
  const config = emailConfigFromEnv()
  const apiKey = process.env.RESEND_API_KEY
  if (!config || !apiKey) return { state: 'not_configured' }
  const db = createSupabaseServiceClient()
  const sender = createResendSender({ apiKey })
  return runLaunchEmail({
    store: supabaseLaunchStore(store.storeId, db),
    step: (campaignId) => sendCampaignStep({
      db, sender, from: config.from, replyTo: config.replyTo, site: config.siteUrl.replace(/\/$/, ''), campaignId, tenantId: store.tenantId,
    }),
    today: storeToday(store.timeZone), deadline,
  })
}
