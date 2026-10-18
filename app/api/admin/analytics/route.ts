import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle } from '@/lib/api'

export const dynamic = 'force-dynamic'

const RANGES: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** Day in the store's time zone (Africa/Lagos), as YYYY-MM-DD. */
function lagosDay(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/**
 * Aggregated analytics for the staff member's tenant. The database function
 * checks analytics.read for that tenant and returns totals only, never
 * individual orders or visitors. KPI definitions: docs/erp/02-analytics-and-compliance.md
 */
export const GET = handle('admin.analytics', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('analytics.read')
  if (denied) return denied

  const range = new URL(req.url).searchParams.get('range') ?? '30d'
  const days = RANGES[range]
  if (!days) throw new BadRequest('Range must be 7d, 30d or 90d.')
  const to = new Date()
  const from = new Date(to.getTime() - (days - 1) * 86_400_000)

  const { data, error } = await staff.supabase.rpc('analytics_summary', {
    p_tenant: staff.tenant.tenantId, p_from: lagosDay(from), p_to: lagosDay(to),
  })
  if (error) throw error
  return NextResponse.json({ range, summary: data }, { headers: { 'Cache-Control': 'private, no-store' } })
})
