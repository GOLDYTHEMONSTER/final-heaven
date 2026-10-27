import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Newsletter and waitlist subscribers for the staff member's store, newest
 * first (customers.read; RLS applies the same rule). The unsubscribe token is
 * never sent: it would let anyone unsubscribe the person.
 */
export const GET = handle('admin.subscribers.list', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('customers.read')
  if (denied) return denied
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100).replace(/[%_]/g, '')
  let query = staff.supabase.from('newsletter_subscribers')
    .select('email, source, subscribed_at, consented_at, unsubscribed_at', { count: 'exact' })
    .eq('tenant_id', staff.tenant.tenantId)
  if (q) query = query.ilike('email', `%${q}%`)
  const { data, count, error } = await query.order('subscribed_at', { ascending: false }).limit(1000)
  if (error) throw error
  return NextResponse.json({ subscribers: data ?? [], total: count ?? 0 }, { headers: { 'Cache-Control': 'private, no-store' } })
})
