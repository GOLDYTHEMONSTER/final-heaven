'use client'

import { useState } from 'react'
import { BarList } from '@/components/admin/charts'
import { Alert, Input, ShippingHeader, api, button, card, kg, naira, pct } from '@/components/admin/shipping/ui'

const VERDICTS: [string, string][] = [
  ['healthy', 'Healthy'], ['under_recovering', 'Under-recovers freight'], ['uncompetitive', 'Uncompetitive'], ['negative_margin', 'Loses money'], ['missing_data', 'Missing data'],
]

export default function SimulatePage() {
  const [s, setS] = useState({ airPerKgNaira: '', recoveryTargetPct: '', reserveSharePct: '', maxContributionPctOfPrice: '', discountPct: '' })
  const [includeDrafts, setIncludeDrafts] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState('')

  async function run(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try { setResult(await api('/api/admin/shipping/simulate', { method: 'POST', json: { ...s, includeDrafts } })) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  const rows = (result?.rows ?? []).filter((r: any) => !show || r.verdict === show)
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <ShippingHeader title="Simulator" intro="Try a freight rate, a recovery target or a clearance discount across the catalogue before it affects anyone. Nothing is saved and no price changes." />
      {error && <Alert>{error}</Alert>}
      <form onSubmit={run} className={`${card} mb-6 grid grid-cols-2 gap-3 md:grid-cols-6`}>
        <Input name="airPerKgNaira" type="number" step="1" label="Air rate ₦/kg, all-in (empty: the rate in force)" value={s.airPerKgNaira} onChange={(n, v) => setS((x) => ({ ...x, [n]: v }))} className="col-span-2" />
        <Input name="recoveryTargetPct" type="number" step="1" label="Recovery target %" value={s.recoveryTargetPct} onChange={(n, v) => setS((x) => ({ ...x, [n]: v }))} />
        <Input name="reserveSharePct" type="number" step="1" label="Reserve share %" value={s.reserveSharePct} onChange={(n, v) => setS((x) => ({ ...x, [n]: v }))} />
        <Input name="maxContributionPctOfPrice" type="number" step="0.5" label="Cap, % of price" value={s.maxContributionPctOfPrice} onChange={(n, v) => setS((x) => ({ ...x, [n]: v }))} />
        <Input name="discountPct" type="number" step="1" label="Clearance discount %" value={s.discountPct} onChange={(n, v) => setS((x) => ({ ...x, [n]: v }))} />
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} /> Include draft products</label>
        <div className="col-span-2 flex items-end md:col-span-4"><button type="submit" disabled={busy} className={button}>{busy ? 'Running…' : 'Run'}</button></div>
      </form>

      {result && (
        <>
          {result.rateUsed == null && <Alert tone="warn">No air rate is in force and none was entered: freight can’t be estimated. Enter a rate per kg to try one.</Alert>}
          <section className={`${card} mb-6 grid gap-6 md:grid-cols-[1fr_1fr]`}>
            <div>
              <p className="text-sm text-final-muted">{result.summary.products} products · freight {naira(result.summary.freightKobo)} a unit each · funded {naira(result.summary.fundedKobo)} ({pct(result.summary.freightKobo ? Math.round((result.summary.fundedKobo / result.summary.freightKobo) * 1000) / 10 : null)})</p>
              <div className="mt-4"><BarList rows={VERDICTS.map(([k, l]) => ({ label: l, value: result.rows.filter((r: any) => r.verdict === k).length }))} format={(v) => String(v)} /></div>
            </div>
            <div className="flex flex-wrap content-start gap-2">
              <button type="button" onClick={() => setShow('')} className={`rounded-md px-3 py-1.5 text-sm ${!show ? 'bg-final-off-white text-final-black' : 'text-final-muted'}`}>All</button>
              {VERDICTS.map(([k, l]) => <button key={k} type="button" onClick={() => setShow(k)} className={`rounded-md px-3 py-1.5 text-sm ${show === k ? 'bg-final-off-white text-final-black' : 'text-final-muted'}`}>{l}</button>)}
            </div>
          </section>
          <div className="overflow-x-auto rounded-xl border border-final-off-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-final-gray text-xs text-final-muted"><tr>{['Product', 'Price', 'Weight', 'Class', 'Freight', 'Contribution', 'Recovers', 'Unfunded', 'Margin after freight', 'Verdict'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-final-off-white/5 tabular-nums">
                {rows.map((r: any) => (
                  <tr key={r.productId}>
                    <td className="px-3 py-1.5">{r.name}<span className="block text-xs text-final-muted">{r.category}</span></td>
                    <td className="px-3 py-1.5">{naira(r.priceKobo)}{r.priceKobo !== r.originalPriceKobo && <span className="block text-xs text-final-muted line-through">{naira(r.originalPriceKobo)}</span>}</td>
                    <td className="px-3 py-1.5">{kg(r.chargeableKg)}</td>
                    <td className="px-3 py-1.5">{r.classKey ?? '—'}</td>
                    <td className="px-3 py-1.5">{naira(r.freightKobo)}</td>
                    <td className="px-3 py-1.5">{naira(r.contributionKobo)}</td>
                    <td className="px-3 py-1.5">{pct(r.recoveryPct)}</td>
                    <td className="px-3 py-1.5">{naira(r.unfundedKobo)}</td>
                    <td className={`px-3 py-1.5 ${r.marginAfterFreightKobo != null && r.marginAfterFreightKobo < 0 ? 'text-final-ember' : ''}`}>{naira(r.marginAfterFreightKobo)} {r.marginPct != null && <span className="text-xs">({r.marginPct}%)</span>}</td>
                    <td className="px-3 py-1.5 text-xs">{VERDICTS.find(([k]) => k === r.verdict)?.[1]}<span className="block text-final-muted">{r.warnings[0]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
