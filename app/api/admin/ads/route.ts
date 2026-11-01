import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle } from '@/lib/api'

export const dynamic = 'force-dynamic'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Day in the store's time zone (Africa/Lagos), as YYYY-MM-DD. */
function lagosDay(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/**
 * Orders, revenue and visitors by campaign, ad set and ad for a date range
 * (from=YYYY-MM-DD&to=YYYY-MM-DD, default the last 30 days), crediting the
 * last or the first touch. The database function checks analytics.read for the
 * tenant and returns totals only. Definitions: docs/erp/07-reachout.md.
 */
export const GET = handle('admin.ads', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('analytics.read')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const now = new Date()
  const to = params.get('to') ?? lagosDay(now)
  const from = params.get('from') ?? lagosDay(new Date(now.getTime() - 29 * 86_400_000))
  const touch = params.get('touch') ?? 'last'
  if (!DAY.test(from) || !DAY.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new BadRequest('Choose a start and an end date.')
  if (to < from || Date.parse(to) - Date.parse(from) > 399 * 86_400_000) throw new BadRequest('Choose a range of up to 400 days, ending after it starts.')
  if (touch !== 'first' && touch !== 'last') throw new BadRequest('Touch must be first or last.')

  const { data, error } = await staff.supabase.rpc('ads_report', { p_tenant: staff.tenant.tenantId, p_from: from, p_to: to, p_touch: touch })
  if (error) throw error
  return NextResponse.json({ report: data }, { headers: { 'Cache-Control': 'private, no-store' } })
})
