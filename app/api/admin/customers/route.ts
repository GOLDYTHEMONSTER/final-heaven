import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle, int } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** One row per customer (by email) for the staff member's tenant. Requires customers.read. */
export const GET = handle('admin.customers.list', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('customers.read')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const search = (params.get('q') ?? '').trim().slice(0, 100)
  const page = int(params.get('page') ?? '1', 'Page', { min: 1, max: 10_000 })
  const limit = 50

  const { data, error } = await staff.supabase.rpc('customer_summaries', {
    p_tenant: staff.tenant.tenantId, p_search: search || null, p_limit: limit, p_offset: (page - 1) * limit,
  })
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return NextResponse.json({
    customers: rows.map(({ total_count, ...c }) => c),
    total: Number(rows[0]?.total_count ?? 0),
    page,
    pageSize: limit,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
