import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle, readJson, text } from '@/lib/api'
import { defaultSavedReplies, mergeSavedReplies } from '@/lib/support'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const siteUrl = () => (process.env.SITE_URL || 'https://www.finalheaven.shop').replace(/\/$/, '')
const COLUMNS = 'id, key, title, body'

/** Saved replies: the built-ins with this store's edits applied, then the ones staff added. Requires customers.read. */
export const GET = handle('admin.saved_replies.list', async () => {
  const { staff, denied } = await requirePermission('customers.read')
  if (denied) return denied
  const { data, error } = await staff.supabase.from('support_saved_replies').select(COLUMNS).eq('tenant_id', staff.tenant.tenantId).order('created_at')
  if (error) throw error
  return NextResponse.json({
    replies: mergeSavedReplies(defaultSavedReplies(siteUrl()), data ?? []), site: siteUrl(), canUpdate: staff.can('customers.update'),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/**
 * Saves a reply. With an id it edits that reply; with the key of a built-in it
 * saves this store's version of it; with neither it adds a new one.
 * Requires customers.update.
 */
export const PUT = handle('admin.saved_replies.save', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('customers.update')
  if (denied) return denied
  const input = await readJson(req, 6_000)
  const title = text(input.title, 'Title', { max: 80, required: true })!
  const body = text(input.body, 'Reply', { max: 3000, required: true })!
  const id = text(input.id, 'Id', { max: 36 })
  const key = text(input.key, 'Key', { max: 30 })
  const tenantId = staff.tenant.tenantId

  if (id) {
    if (!UUID.test(id)) throw new BadRequest('Invalid reply id.')
    const { data, error } = await staff.supabase.from('support_saved_replies').update({ title, body })
      .eq('id', id).eq('tenant_id', tenantId).select(COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Reply not found.' }, { status: 404 })
    return NextResponse.json({ reply: data })
  }
  if (key && !defaultSavedReplies('').some((r) => r.key === key)) throw new BadRequest('Unknown built-in reply.')
  const { data, error } = key
    ? await staff.supabase.from('support_saved_replies').upsert({ tenant_id: tenantId, key, title, body }, { onConflict: 'tenant_id,key' }).select(COLUMNS).single()
    : await staff.supabase.from('support_saved_replies').insert({ tenant_id: tenantId, title, body }).select(COLUMNS).single()
  if (error) throw error
  return NextResponse.json({ reply: data }, { status: 201 })
})

/** Deletes a reply staff added, or this store's edit of a built-in (which brings the built-in back). */
export const DELETE = handle('admin.saved_replies.delete', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('customers.update')
  if (denied) return denied
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID.test(id)) throw new BadRequest('Invalid reply id.')
  const { error } = await staff.supabase.from('support_saved_replies').delete().eq('id', id).eq('tenant_id', staff.tenant.tenantId)
  if (error) throw error
  return NextResponse.json({ ok: true })
})
