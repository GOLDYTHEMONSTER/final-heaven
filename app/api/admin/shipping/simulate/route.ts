import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle, readJson } from '@/lib/api'
import { simulate } from '@/lib/shipping/engine'
import { catalogue, optNumber, pct } from '@/lib/shipping/admin'

export const dynamic = 'force-dynamic'

/** Runs the catalogue through a scenario (a rate, a target, a discount). Read-only: nothing is saved and no price changes. */
export const POST = handle('admin.shipping.simulate', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.read')
  if (denied) return denied
  const b = await readJson(req, 4_000)
  const scenario = {
    airPerKgNaira: optNumber(b.airPerKgNaira, 'Air rate per kg', 1, 1_000_000),
    recoveryTargetPct: pct(b.recoveryTargetPct, 'Recovery target'),
    reserveSharePct: optNumber(b.reserveSharePct, 'Reserve share', 0, 94),
    maxContributionPctOfPrice: pct(b.maxContributionPctOfPrice, 'Contribution cap'),
    discountPct: optNumber(b.discountPct, 'Discount', 0, 95),
  }
  const cat = await catalogue(staff.supabase, staff.tenant.tenantId)
  const onlyActive = b.includeDrafts !== true
  const r = simulate(cat.inputs.filter((p) => !onlyActive || p.status === 'active'), cat.ctx, scenario)
  return NextResponse.json({
    ...r,
    rows: r.rows.map((x) => ({
      productId: x.productId, name: x.name, category: x.category, originalPriceKobo: x.originalPriceKobo, priceKobo: x.priceKobo,
      chargeableKg: x.chargeableKg, classKey: x.classKey, freightKobo: x.freightKobo, contributionKobo: x.contributionKobo, recoveryPct: x.recoveryPct,
      unfundedKobo: x.unfundedKobo, marginAfterFreightKobo: x.marginAfterFreightKobo, marginPct: x.marginPct, verdict: x.verdict, warnings: x.warnings.slice(0, 2),
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
