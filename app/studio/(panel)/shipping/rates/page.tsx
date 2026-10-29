'use client'

import { useCallback, useEffect, useState } from 'react'
import { Alert, Input, Pill, ShippingHeader, api, button, card, field, ghost, label, naira } from '@/components/admin/shipping/ui'
import { QuickRate } from '@/components/admin/shipping/QuickRate'

const BLANK_RATE = {
  method: 'air', provider: '', origin: 'Guangzhou', destination: 'Lagos', currency: 'NGN', fx_rate: '', billing_unit: 'kg', rate_per_unit: '',
  volumetric_divisor: '', min_chargeable: '', rounding_increment: '', min_shipment_charge: '', surcharge_per_unit: '', handling_per_shipment: '',
  clearance_included: false, clearance_per_unit: '', insurance_pct: '', contingency_pct: '', typical_shipment_units: '',
  included_services: '', excluded_services: '', notes: '', document_url: '', effective_from: '', effective_to: '', confirmed: false,
}
type RateForm = typeof BLANK_RATE
const str = (v: unknown) => (v == null ? '' : String(v))

export default function RatesPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<RateForm | null>(null)
  const [replaces, setReplaces] = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, any> | null>(null)
  const [classes, setClasses] = useState<Record<string, string>[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await api('/api/admin/shipping/rates')
      setData(d)
      const s = d.settings ?? {}
      setSettings({
        recovery_target_pct: str(s.recovery_target_pct ?? 50), reserve_share_pct: str(s.reserve_share_pct ?? 0), platform_contribution_pct: str(s.platform_contribution_pct ?? 0),
        max_contribution_pct_of_price: str(s.max_contribution_pct_of_price), min_margin_pct: str(s.min_margin_pct), target_margin_pct: str(s.target_margin_pct),
        payment_fee_pct: str(s.payment_fee_pct), payment_fee_fixed: str(s.payment_fee_fixed), platform_recognised_on: s.platform_recognised_on ?? 'delivered',
        value_tier_factors: { low: '1', standard: '1', premium: '1', luxury: '1', ...Object.fromEntries(Object.entries(s.value_tier_factors ?? {}).map(([k, v]) => [k, str(v)])) },
      })
      setClasses((d.classes ?? []).map((c: any) => Object.fromEntries(['key', 'name', 'sort', 'max_chargeable_kg', 'min_contribution', 'max_contribution', 'max_contribution_pct_of_price', 'adjustment_factor'].map((k) => [k, str(c[k])]))))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const can = data?.can?.manage
  const setF = (k: string, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f))

  function startReplace(r: any) {
    setReplaces(r.id)
    setForm({ ...BLANK_RATE, ...Object.fromEntries(Object.keys(BLANK_RATE).map((k) => [k, typeof BLANK_RATE[k as keyof RateForm] === 'boolean' ? Boolean(r[k]) : str(r[k])])), effective_from: '', effective_to: '', confirmed: false } as RateForm)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveRate(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/admin/shipping/rates', { method: 'POST', json: { ...form, replaces } })
      setForm(null); setReplaces(null)
      setNotice('Rate saved. New checkouts use it from its start date; orders already placed keep the rate they were placed with.')
      await load()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  async function setStatus(id: string, status: 'active' | 'inactive') {
    setError('')
    try { await api('/api/admin/shipping/rates', { method: 'PUT', json: { id, status } }); await load() } catch (e) { setError((e as Error).message) }
  }

  async function saveRules() {
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/admin/shipping/rates', { method: 'PUT', json: { settings, classes } })
      setNotice('Rules saved. They apply to new checkouts and previews; placed orders keep their own figures.')
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <ShippingHeader title="Rates and rules" intro="Your forwarders’ rates, and how much of each product’s price goes to freight. A saved rate is never edited: replace it with a new one, so past estimates still add up.">
        {can && !form && <button type="button" className={button} onClick={() => { setReplaces(null); setForm({ ...BLANK_RATE }) }}>Add a rate</button>}
      </ShippingHeader>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="ok">{notice}</Alert>}

      {form && (
        <form onSubmit={saveRate} className={`${card} mb-8`}>
          <h2 className="font-semibold">{replaces ? 'Replace rate' : 'New rate'}</h2>
          <p className="mt-1 text-xs text-final-muted">Enter your forwarder’s real terms. Leave anything you don’t know empty: estimates say what they leave out.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className={label}>Method
              <select value={form.method} onChange={(e) => { setF('method', e.target.value); if (e.target.value === 'air') setF('billing_unit', 'kg') }} className={`${field} mt-1`}>
                <option value="air">Air</option><option value="sea">Sea</option>
              </select>
            </label>
            <Input name="provider" label="Forwarder" value={form.provider} onChange={setF} />
            <Input name="origin" label="From" value={form.origin} onChange={setF} />
            <Input name="destination" label="To" value={form.destination} onChange={setF} />
            <label className={label}>Billed by
              <select value={form.billing_unit} disabled={form.method === 'air'} onChange={(e) => setF('billing_unit', e.target.value)} className={`${field} mt-1`}>
                <option value="kg">Kilogram</option><option value="cbm">Cubic metre</option>
              </select>
            </label>
            <label className={label}>Currency
              <select value={form.currency} onChange={(e) => setF('currency', e.target.value)} className={`${field} mt-1`}>{['NGN', 'USD', 'CNY'].map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            {form.currency !== 'NGN' && <Input name="fx_rate" type="number" step="0.000001" label={`Naira per ${form.currency}`} value={form.fx_rate} onChange={setF} />}
            <Input name="rate_per_unit" type="number" step="0.01" label={`Rate per ${form.billing_unit} (${form.currency})`} value={form.rate_per_unit} onChange={setF} />
            {form.billing_unit === 'kg' && <Input name="volumetric_divisor" type="number" label="Volumetric divisor (cm³/kg)" placeholder="e.g. 6000" value={form.volumetric_divisor} onChange={setF} />}
            <Input name="min_chargeable" type="number" step="0.001" label={`Minimum per shipment (${form.billing_unit})`} value={form.min_chargeable} onChange={setF} />
            <Input name="rounding_increment" type="number" step="0.001" label={`Rounds up to (${form.billing_unit})`} placeholder="e.g. 0.5" value={form.rounding_increment} onChange={setF} />
            <Input name="min_shipment_charge" type="number" step="0.01" label={`Minimum charge (${form.currency})`} value={form.min_shipment_charge} onChange={setF} />
            <Input name="surcharge_per_unit" type="number" step="0.01" label={`Surcharges per ${form.billing_unit}`} value={form.surcharge_per_unit} onChange={setF} />
            <Input name="handling_per_shipment" type="number" step="0.01" label="Handling per shipment" value={form.handling_per_shipment} onChange={setF} />
            <Input name="typical_shipment_units" type="number" step="0.001" label={`Usual shipment (${form.billing_unit})`} placeholder="spreads handling" value={form.typical_shipment_units} onChange={setF} />
            <Input name="insurance_pct" type="number" step="0.01" label="Insurance (% of goods)" value={form.insurance_pct} onChange={setF} />
            <Input name="contingency_pct" type="number" step="0.01" label="Contingency %" value={form.contingency_pct} onChange={setF} />
            <label className={`${label} col-span-2 flex items-center gap-2 pt-5`}>
              <input type="checkbox" checked={form.clearance_included} onChange={(e) => setF('clearance_included', e.target.checked)} /> Clearance is included in this rate
            </label>
            {!form.clearance_included && <Input name="clearance_per_unit" type="number" step="0.01" label={`Clearance per ${form.billing_unit}`} value={form.clearance_per_unit} onChange={setF} />}
            <Input name="effective_from" type="date" label="Starts" value={form.effective_from} onChange={setF} />
            <Input name="effective_to" type="date" label="Ends (optional)" value={form.effective_to} onChange={setF} />
            <Input name="included_services" label="Included" className="col-span-2" value={form.included_services} onChange={setF} />
            <Input name="excluded_services" label="Not included" className="col-span-2" value={form.excluded_services} onChange={setF} />
            <Input name="document_url" type="url" label="Quote or rate card link" className="col-span-2" value={form.document_url} onChange={setF} />
            <Input name="notes" label="Notes" className="col-span-2" value={form.notes} onChange={setF} />
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.confirmed} onChange={(e) => setF('confirmed', e.target.checked)} className="mt-1" />
            This is the forwarder’s real, current rate. It can’t be edited once saved{replaces ? '; the old rate ends the day before this one starts' : ''}.
          </label>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={busy || !form.confirmed} className={button}>{busy ? 'Saving…' : 'Save rate'}</button>
            <button type="button" onClick={() => { setForm(null); setReplaces(null) }} className="text-sm text-final-muted hover:text-final-off-white">Cancel</button>
          </div>
        </form>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Rates</h2>
        {data && data.rates.length === 0 && (
          <Alert tone="warn">No rate yet. Until you add your forwarder’s rate, freight estimates are marked incomplete and nothing is recorded as recovered.</Alert>
        )}
        <ul className="space-y-3">
          {data?.rates.map((r: any) => (
            <li key={r.id} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{r.provider} <span className="ml-1 text-xs font-normal uppercase tracking-[0.12em] text-final-muted">{r.method}</span></p>
                <Pill value={r.state === 'in_force' ? 'verified' : r.state === 'upcoming' ? 'estimated' : 'missing_data'}>{r.state.replace('_', ' ')}</Pill>
              </div>
              <p className="mt-1 text-sm text-final-muted">
                {r.currency} {Number(r.rate_per_unit).toLocaleString()}/{r.billing_unit} · all-in {naira(r.perUnitKobo)}/{r.billing_unit} · {r.effective_from}{r.effective_to ? ` to ${r.effective_to}` : ' onwards'}
                {r.volumetric_divisor ? ` · divisor ${r.volumetric_divisor}` : ''}{r.clearance_included ? ' · clearance included' : ''}
              </p>
              {r.perUnitParts?.length > 1 && <p className="mt-1 text-xs text-final-muted">{r.perUnitParts.map((p: any) => `${p.label} ${naira(p.kobo)}`).join(' + ')}</p>}
              {r.warnings.map((w: string) => <p key={w} className="mt-1 text-xs text-yellow-200">{w}</p>)}
              {(r.included_services || r.excluded_services) && <p className="mt-1 text-xs text-final-muted">{r.included_services && `Includes: ${r.included_services}. `}{r.excluded_services && `Excludes: ${r.excluded_services}.`}</p>}
              {r.document_url && <a href={r.document_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline">Rate card</a>}
              {can && r.state === 'in_force' && <QuickRate key={r.id} rate={r} onDone={(m) => { setNotice(m); load() }} />}
              {can && r.status !== 'superseded' && (
                <div className="mt-3 flex gap-3 text-sm">
                  <button type="button" className={ghost} onClick={() => startReplace(r)}>Replace, changing other terms</button>
                  <button type="button" className={ghost} onClick={() => setStatus(r.id, r.status === 'active' ? 'inactive' : 'active')}>{r.status === 'active' ? 'Stop using' : 'Use again'}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {settings && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Recovery rules</h2>
          <p className="mt-1 text-sm text-final-muted">How each product’s price is split. Leave a field empty for “not set”: nothing is assumed for it.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              ['recovery_target_pct', 'Recovery target (% of freight)'], ['reserve_share_pct', 'Reserve share (% of contribution)'],
              ['platform_contribution_pct', 'Platform share (% of price)'], ['max_contribution_pct_of_price', 'Contribution cap (% of price)'],
              ['min_margin_pct', 'Margin floor after freight (%)'], ['target_margin_pct', 'Target margin, for suggested prices (%)'],
              ['payment_fee_pct', 'Payment fee (% of price)'], ['payment_fee_fixed', 'Payment fee (₦ fixed, per item)'],
            ] as const).map(([k, name]) => (
              <Input key={k} name={k} type="number" step="0.01" label={name} value={settings[k]} onChange={(n, v) => setSettings((s) => ({ ...s, [n]: v }))} />
            ))}
            <label className={label}>Platform share counts as earned when the order is
              <select value={settings.platform_recognised_on} onChange={(e) => setSettings((s) => ({ ...s, platform_recognised_on: e.target.value }))} className={`${field} mt-1`}>
                <option value="delivered">delivered</option><option value="shipped">shipped</option>
              </select>
            </label>
            {(['low', 'standard', 'premium', 'luxury'] as const).map((t) => (
              <Input key={t} name={t} type="number" step="0.01" label={`Value tier × (${t})`} value={settings.value_tier_factors[t]}
                onChange={(n, v) => setSettings((s) => ({ ...s, value_tier_factors: { ...s!.value_tier_factors, [n]: v } }))} />
            ))}
          </div>

          <h3 className="mt-8 font-semibold">Shipping classes</h3>
          <p className="mt-1 text-sm text-final-muted">A product falls in the first class its chargeable weight fits, unless you choose one on the product. Its category never decides.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-final-muted"><tr>{['Key', 'Name', 'Order', 'Up to (kg)', 'Min ₦', 'Max ₦', 'Max % of price', 'Factor', ''].map((h) => <th key={h} className="py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {classes.map((c, i) => (
                  <tr key={i}>
                    {['key', 'name', 'sort', 'max_chargeable_kg', 'min_contribution', 'max_contribution', 'max_contribution_pct_of_price', 'adjustment_factor'].map((k) => (
                      <td key={k} className="py-1 pr-2">
                        <input aria-label={k} value={c[k]} onChange={(e) => setClasses((list) => list.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} className={field} />
                      </td>
                    ))}
                    <td><button type="button" onClick={() => setClasses((list) => list.filter((_, j) => j !== i))} className="text-xs text-final-ember underline">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {can && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className={ghost} onClick={() => setClasses((l) => [...l, { key: '', name: '', sort: String(l.length + 1), max_chargeable_kg: '', min_contribution: '', max_contribution: '', max_contribution_pct_of_price: '', adjustment_factor: '1' }])}>Add class</button>
              <button type="button" className={button} disabled={busy} onClick={saveRules}>{busy ? 'Saving…' : 'Save rules and classes'}</button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
