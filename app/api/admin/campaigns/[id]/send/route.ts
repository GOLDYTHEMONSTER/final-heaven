import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { handle, readJson, requestIdOf } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { emailConfigFromEnv } from '@/lib/email'
import { createResendSender } from '@/lib/email/resend'
import { sendCampaignStep } from '@/lib/email/campaign-send'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Sends the next small batch of a campaign (lib/email/campaign-send). The
 * Studio calls it again until nothing is left. The first call needs
 * { confirm: true }: that's the moment the campaign starts going out.
 */
export const POST = handle('admin.campaigns.send', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown campaign.' }, { status: 404 })
  const config = emailConfigFromEnv()
  if (!config || !process.env.RESEND_API_KEY) return NextResponse.json({ error: 'Email isn’t set up yet: add RESEND_API_KEY and EMAIL_FROM in Vercel.' }, { status: 503 })
  const body = await readJson(req, 500)

  const db = createSupabaseServiceClient()
  const { data: current, error } = await db.from('email_campaigns').select('status').eq('id', params.id).eq('tenant_id', staff.tenant.tenantId).maybeSingle()
  if (error) throw error
  if (!current) return NextResponse.json({ error: 'Unknown campaign.' }, { status: 404 })
  if (current.status === 'draft' && body.confirm !== true) return NextResponse.json({ error: 'Confirm before sending.' }, { status: 400 })

  try {
    const progress = await sendCampaignStep({
      db, sender: createResendSender({ apiKey: process.env.RESEND_API_KEY }), from: config.from, replyTo: config.replyTo,
      site: config.siteUrl, campaignId: params.id, tenantId: staff.tenant.tenantId,
    })
    if (current.status === 'draft') {
      await audit({ tenantId: staff.tenant.tenantId, action: 'campaign.sending', entityType: 'email_campaign', entityId: params.id,
        actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { recipients: progress.recipients } })
    }
    return NextResponse.json({ progress })
  } catch (e) {
    const message = (e as Error).message
    if (message.startsWith('not_ready:')) return NextResponse.json({ error: message.slice(10) }, { status: 400 })
    throw e
  }
})
