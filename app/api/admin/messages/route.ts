import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle, readJson, text } from '@/lib/api'

export const dynamic = 'force-dynamic'

const STATUSES = ['open', 'replied', 'closed']

/** Contact-form messages for the staff member's tenant. Requires customers.read. */
export const GET = handle('admin.messages.list', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('customers.read')
  if (denied) return denied

  const status = new URL(req.url).searchParams.get('status')
  let query = staff.supabase.from('contact_messages').select('*').eq('tenant_id', staff.tenant.tenantId)
  if (status) {
    if (!STATUSES.includes(status)) throw new BadRequest('Unknown status.')
    query = query.eq('status', status)
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return NextResponse.json({ messages: data ?? [], canUpdate: staff.can('customers.update') },
    { headers: { 'Cache-Control': 'private, no-store' } })
})

/** Marks a message replied or closed. Requires customers.update; who and when are stamped by the database. */
export const PUT = handle('admin.messages.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('customers.update')
  if (denied) return denied

  const body = await readJson(req, 1_000)
  const id = text(body.id, 'Message id', { max: 36, required: true })!
  const status = text(body.status, 'Status', { max: 10, required: true })!
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequest('Invalid message id.')
  if (!STATUSES.includes(status)) throw new BadRequest('Unknown status.')

  const { data, error } = await staff.supabase.from('contact_messages').update({ status })
    .eq('id', id).eq('tenant_id', staff.tenant.tenantId).select().maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
  return NextResponse.json({ message: data })
})
