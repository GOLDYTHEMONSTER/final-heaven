import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { emailConfigFromEnv } from '@/lib/email'
import { createResendSender, EmailError } from '@/lib/email/resend'
import { renderCampaign } from '@/lib/email/campaign'
import { campaignProducts, type CampaignRow } from '@/lib/email/campaign-send'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sends the campaign as it stands to the signed-in staff member only, marked as a test. */
export const POST = handle('admin.campaigns.test', async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown campaign.' }, { status: 404 })
  const config = emailConfigFromEnv()
  if (!config || !process.env.RESEND_API_KEY) return NextResponse.json({ error: 'Email isn’t set up yet: add RESEND_API_KEY and EMAIL_FROM in Vercel.' }, { status: 503 })
  if (!staff.email) return NextResponse.json({ error: 'Your account has no email address to send the test to.' }, { status: 400 })

  const { data: c, error } = await staff.supabase.from('email_campaigns').select('*').eq('id', params.id).eq('tenant_id', staff.tenant.tenantId).maybeSingle<CampaignRow>()
  if (error) throw error
  if (!c) return NextResponse.json({ error: 'Unknown campaign.' }, { status: 404 })
  const products = await campaignProducts(createSupabaseServiceClient(), staff.tenant.tenantId, c.product_ids ?? [])
  const email = renderCampaign({ subject: c.subject, preheader: c.preheader, heading: c.heading, body: c.body, ctaLabel: c.cta_label, ctaUrl: c.cta_url },
    { products, site: config.siteUrl, unsubscribeUrl: `${config.siteUrl}/unsubscribe`, reason: 'this is a test, sent only to you' })
  try {
    await createResendSender({ apiKey: process.env.RESEND_API_KEY }).send(
      { from: config.from, to: [staff.email], replyTo: config.replyTo, subject: `[Test] ${email.subject || '(no subject)'}`, html: email.html, text: email.text },
      `campaign-test:${randomUUID()}`)
  } catch (e) {
    const message = e instanceof EmailError ? e.message : 'Sending failed.'
    return NextResponse.json({ error: `The test didn’t send: ${message}` }, { status: 502 })
  }
  return NextResponse.json({ message: `Test sent to ${staff.email}.` })
})
