import { NextRequest, NextResponse } from 'next/server'
import { getStaffContext } from '@/lib/auth'
import { BadRequest, handle } from '@/lib/api'

export const dynamic = 'force-dynamic'

const RANGES: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

/**
 * Period-over-period trends for sales, fulfilment, customers and messages.
 * The database includes each section only if the caller holds its
 * permission (orders.read or customers.read), and refuses everyone else.
 */
export const GET = handle('admin.trends', async (req: NextRequest) => {
  const staff = await getStaffContext()
  if (!staff) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!staff.can('orders.read') && !staff.can('customers.read')) {
    return NextResponse.json({ error: 'You don’t have permission to view trends.' }, { status: 403 })
  }

  const range = new URL(req.url).searchParams.get('range') ?? '30d'
  const days = RANGES[range]
  if (!days) throw new BadRequest('Range must be 7d, 30d or 90d.')

  const { data, error } = await staff.supabase.rpc('business_trends', { p_tenant: staff.tenant.tenantId, p_days: days })
  if (error?.code === 'PGRST202') {
    return NextResponse.json({ error: 'Trends will appear once the latest database update is applied.' }, { status: 503 })
  }
  if (error) throw error
  return NextResponse.json({ range, trends: data }, { headers: { 'Cache-Control': 'private, no-store' } })
})
