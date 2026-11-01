import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { handle, readJson, requestIdOf, text } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { emailConfigFromEnv, sendQueuedEmails } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Replies to a customer by email. Requires customers.update. The reply, its
 * email in the outbox and the "replied" status are saved together
 * (send_support_reply); the email then goes out at once. Service mail is never
 * held for approval. If email isn't set up the reply is kept and the email
 * waits in the outbox, which the response says.
 */
export const POST = handle('admin.messages.reply', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('customers.update')
  if (denied) return denied
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })

  const body = text((await readJson(req, 8_000)).body, 'Reply', { max: 5000, required: true })!
  const { data, error } = await createSupabaseServiceClient().rpc('send_support_reply', {
    p_tenant: staff.tenant.tenantId, p_message: params.id, p_author: staff.userId, p_author_email: staff.email, p_body: body,
  })
  if (error) {
    if (error.code === 'P0002') return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    throw error
  }
  await audit({ tenantId: staff.tenant.tenantId, action: 'support.replied', entityType: 'contact_message', entityId: params.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { replyId: data } })
  await sendQueuedEmails()
  return NextResponse.json({ ok: true, emailConfigured: Boolean(emailConfigFromEnv()) }, { status: 201 })
})
