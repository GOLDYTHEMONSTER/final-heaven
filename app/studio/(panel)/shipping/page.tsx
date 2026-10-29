'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { BarList, DataTable } from '@/components/admin/charts'
import { Alert, Pill, ShippingHeader, Tile, api, card, field, kg, label, naira, pct } from '@/components/admin/shipping/ui'
import { QuickRate } from '@/components/admin/shipping/QuickRate'

const FILTERS = ['from', 'to', 'method', 'category', 'product', 'class', 'campaign', 'shipment', 'status', 'recovery'] as const
type FilterState = Record<(typeof FILTERS)[number], string>
const NONE = Object.fromEntries(FILTERS.map((f) => [f, ''])) as FilterState

const HEALTH: [string, string, string][] = [
  ['missingData', 'Missing weight or size', 'No packed weight yet: freight can’t be estimated.'],
  ['estimatedOnly', 'Estimated, not measured', 'Weight or size is an estimate, or the dimensions are missing.'],
  ['belowTarget', 'Below the recovery target', 'The contribution recovers less freight than the target; the gap is recorded.'],
  ['cappedByPrice', 'Capped by the % of price limit', 'The contribution would be too large a share of the price.'],
  ['negativeMargin', 'Loses money after freight', 'Supplier, landed costs and unfunded freight exceed the price.'],
  ['needsReview', 'Needs review', 'Under the margin floor, or the contribution is overridden.'],
]

export default function ShippingOverview() {
  const [filters, setFilters] = useState<FilterState>(NONE)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const load = useCallback(async (f: FilterState) => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v))
      setData(await api(`/api/admin/shipping?${qs}`))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load(filters) }, [filters, load])

  const set = (k: keyof FilterState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const o = data?.overview
  const active = FILTERS.some((k) => filters[k])

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <ShippingHeader title="Shipping" intro={<>Freight cost recovery, from what each paid order set aside to what the forwarder finally charged. Customers pay one price; the split below is internal.</>} />

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="ok">{notice}</Alert>}
      {data && (
        <section className="mb-6 grid gap-4 md:grid-cols-2">
          {(['air', 'sea'] as const).map((m) => {
            const r = data.rates[m]
            return (
              <div key={m} className={card}>
                <p className="text-sm text-final-muted">{m === 'air' ? 'Air freight rate in force' : 'Sea freight rate in force'}</p>
                {r.rate
                  ? <p className="mt-2 text-xl font-semibold">{r.rate.provider} · {naira(r.rate.perUnitKobo)}/{r.rate.billingUnit} all-in</p>
                  : <p className="mt-2 text-xl font-semibold text-final-ember">None</p>}
                {r.rate && r.rate.currency !== 'NGN' && <p className="mt-1 text-xs text-final-muted">{r.rate.currency} {r.rate.ratePerUnit}/{r.rate.billingUnit} at ₦{r.rate.fxRate} per {r.rate.currency}</p>}
                {r.warning && <p className="mt-1 text-sm text-yellow-200">{r.warning}</p>}
                {r.rate && data.can.manage && <QuickRate key={r.rate.id} rate={{ id: r.rate.id, currency: r.rate.currency, rate_per_unit: r.rate.ratePerUnit, fx_rate: r.rate.fxRate, billing_unit: r.rate.billingUnit }} onDone={(m) => { setNotice(m); load(filters) }} />}
                {data.rates.upcoming.filter((u: any) => u.method === m).map((u: any) => (
                  <p key={u.id} className="mt-1 text-xs text-final-muted">Next: {u.provider} from {u.effectiveFrom}</p>
                ))}
                <Link href="/studio/shipping/rates" className="mt-2 inline-block text-xs underline underline-offset-2">Rates and rules</Link>
              </div>
            )
          })}
        </section>
      )}

      <details className={`${card} mb-6`} open={active}>
        <summary className="cursor-pointer text-sm font-medium">Filters{active ? ' (on)' : ''}</summary>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className={label}>From<input type="date" value={filters.from} onChange={set('from')} className={`${field} mt-1`} /></label>
          <label className={label}>To<input type="date" value={filters.to} onChange={set('to')} className={`${field} mt-1`} /></label>
          <label className={label}>Method<select value={filters.method} onChange={set('method')} className={`${field} mt-1`}><option value="">All</option><option value="air">Air</option><option value="sea">Sea</option></select></label>
          <label className={label}>Category<select value={filters.category} onChange={set('category')} className={`${field} mt-1`}><option value="">All</option>{data?.categories.map((c: string) => <option key={c}>{c}</option>)}</select></label>
          <label className={label}>Product<select value={filters.product} onChange={set('product')} className={`${field} mt-1`}><option value="">All</option>{data?.products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className={label}>Class<select value={filters.class} onChange={set('class')} className={`${field} mt-1`}><option value="">All</option>{data?.classes.map((c: any) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></label>
          <label className={label}>Campaign<select value={filters.campaign} onChange={set('campaign')} className={`${field} mt-1`}><option value="">All</option>{data?.campaigns.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className={label}>Shipment<select value={filters.shipment} onChange={set('shipment')} className={`${field} mt-1`}><option value="">All</option>{data?.shipments.map((s: any) => <option key={s.id} value={s.id}>{s.reference}</option>)}</select></label>
          <label className={label}>Order status<select value={filters.status} onChange={set('status')} className={`${field} mt-1`}><option value="">All</option>{['confirmed', 'processing', 'shipped', 'delivered'].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className={label}>Recovery<select value={filters.recovery} onChange={set('recovery')} className={`${field} mt-1`}><option value="">All</option><option value="below_target">Below target</option><option value="on_target">On target</option></select></label>
        </div>
        {active && <button type="button" onClick={() => setFilters(NONE)} className="mt-3 text-xs underline underline-offset-2">Clear filters</button>}
        <p className="mt-2 text-xs text-final-muted">Shipment-level entries (reserve draws, unfunded freight on a reconciled shipment, manual adjustments) belong to no product, so product filters leave them out.</p>
      </details>

      {!data && loading && <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>}

      {o && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <section aria-label="Freight">
            <h2 className="mb-3 text-lg font-semibold">Freight</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Tile label="Estimated freight, paid orders" value={naira(o.estimatedFreightKobo)} note={`${o.paidOrders} orders · ${kg(o.chargeableKg)}`} />
              <Tile label="Recovered by contributions" value={pct(o.estimatedRecoveryPct)} note={`Target ${data.settings.recoveryTargetPct}% · contributions ${naira(o.contributionsKobo)}`}
                tone={o.estimatedRecoveryPct != null && o.estimatedRecoveryPct < data.settings.recoveryTargetPct ? 'warn' : undefined} />
              <Tile label="Estimated unfunded freight" value={naira(o.estimatedUnfundedKobo)} note="Freight no contribution or subsidy covers: margin pays it" />
              <Tile label="Shipping liability" value={naira(o.estimatedLiabilityKobo)} note="Estimated freight of paid orders not yet reconciled" />
              <Tile label="Invoiced, not reconciled" value={naira(o.unreconciledActualKobo)} note="Freight invoices on open shipments" />
              <Tile label="Unfunded freight recorded" value={naira(o.unfundedRecordedKobo)} note="From reconciled shipments" tone={o.unfundedRecordedKobo > 0 ? 'warn' : undefined} />
              <Tile label="Clearance subsidies" value={naira(o.subsidiesKobo)} note="Freight paid from campaign budgets" />
              <Tile label="Freight recovered (ledger)" value={naira(o.freightRecoveredKobo)} note="Net of cancellations and refunds" />
            </div>
          </section>

          <section aria-label="Reserve and platform">
            <h2 className="mb-3 text-lg font-semibold">Reserve and platform</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Tile label="Logistics reserve" value={naira(o.reserveBalanceKobo)} note="Set aside for freight surprises. Not revenue." />
              <Tile label="Platform contribution, held" value={naira(o.platformHeldKobo)} note={`Paid orders not yet ${data.settings.platformRecognisedOn}`} />
              <Tile label="Platform contribution, earned" value={naira(o.platformEarnedKobo)} note={`Orders ${data.settings.platformRecognisedOn}`} tone="ok" />
            </div>
          </section>

          {data.partialRefunds.length > 0 && (
            <Alert tone="warn">Partly refunded: {data.partialRefunds.join(', ')}. Their shipping shares weren’t reversed automatically; adjust them in the <Link href="/studio/shipping/ledger" className="underline">ledger</Link>.</Alert>
          )}

          <section aria-label="Product pricing health" className={card}>
            <h2 className="text-lg font-semibold">Product pricing health</h2>
            <p className="mt-1 text-sm text-final-muted">Every product run through the current rate and rules at its current price.</p>
            <div className="mt-4">
              <BarList rows={HEALTH.map(([k, name]) => ({ label: name, value: data.health[k].length }))} format={(v) => `${v} product${v === 1 ? '' : 's'}`} />
            </div>
            <div className="mt-4 space-y-2">
              {HEALTH.filter(([k]) => data.health[k].length).map(([k, name, why]) => (
                <details key={k} className="rounded-lg border border-final-off-white/10 p-3">
                  <summary className="cursor-pointer text-sm">{name} ({data.health[k].length})</summary>
                  <p className="mt-1 text-xs text-final-muted">{why}</p>
                  <ul className="mt-2 divide-y divide-final-off-white/5 text-sm">
                    {data.health[k].slice(0, 50).map((p: any) => (
                      <li key={p.productId} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                        <Link href={`/studio?edit=${p.productId}`} className="underline-offset-2 hover:underline">{p.name}</Link>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-final-muted tabular-nums">
                          {naira(p.priceKobo)} · freight {naira(p.freightKobo)} · recovers {pct(p.recoveryPct)} · margin {pct(p.marginPct)}
                          <Pill value={p.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          <section aria-label="Shipments" className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Shipments</h2>
              <Link href="/studio/shipping/shipments" className="text-sm underline underline-offset-2">
                {data.awaitingShipment.length ? `${data.awaitingShipment.length} paid order${data.awaitingShipment.length === 1 ? '' : 's'} waiting for a shipment` : 'Manage shipments'}
              </Link>
            </div>
            {data.shipments.length === 0 ? <p className="mt-3 text-sm text-final-muted">No shipments yet.</p> : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-final-muted"><tr>{['Shipment', 'Status', 'Estimated', 'Actual', 'Recovered', 'Unfunded'].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-final-off-white/5 tabular-nums">
                    {data.shipments.map((s: any) => (
                      <tr key={s.id}>
                        <td className="py-2 pr-4">{s.reference} <span className="text-xs text-final-muted">{s.method} · {s.kind === 'orders' ? `${s.orders} orders` : 'inventory'}</span></td>
                        <td className="py-2 pr-4"><Pill value={s.status} /></td>
                        <td className="py-2 pr-4">{naira(s.estimatedKobo)}{s.estimatedUnits != null && <span className="text-xs text-final-muted"> · {s.estimatedUnits}</span>}</td>
                        <td className="py-2 pr-4">{naira(s.actualKobo)}{s.actualUnits != null && <span className="text-xs text-final-muted"> · {s.actualUnits}</span>}</td>
                        <td className="py-2 pr-4">{pct(s.recoveryPct)}</td>
                        <td className="py-2 pr-4">{naira(s.unfundedKobo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Clearance" className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Clearance campaigns</h2>
              <Link href="/studio/shipping/campaigns" className="text-sm underline underline-offset-2">Manage clearance</Link>
            </div>
            {data.campaigns.length === 0 ? <p className="mt-3 text-sm text-final-muted">No campaigns yet.</p> : (
              <>
                <div className="mt-3"><BarList rows={data.campaigns.map((c: any) => ({ label: c.name, value: c.revenueKobo, note: `${c.items} sold` }))} format={naira} /></div>
                {data.campaigns.some((c: any) => c.expiredButLive) && <Alert tone="warn">A campaign has passed its end date but is still marked active: end it to restore its prices.</Alert>}
                <DataTable caption="Clearance campaigns" columns={['Campaign', 'Status', 'Revenue', 'Orders', 'Freight recovered', 'Avg per order', 'Subsidy used', 'Budget left']}
                  rows={data.campaigns.map((c: any) => [c.name, c.status, naira(c.revenueKobo), c.orders, naira(c.freightRecoveredKobo), naira(c.avgContributionPerOrderKobo), naira(c.subsidyUsedKobo), c.budgetLeftKobo == null ? '—' : naira(c.budgetLeftKobo)])} />
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
