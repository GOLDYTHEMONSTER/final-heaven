'use client'

import { useCallback, useEffect, useState } from 'react'
import { Alert, Input, Pill, ShippingHeader, api, button, card, field, ghost, label, naira, pct } from '@/components/admin/shipping/ui'

const TREATMENTS: [string, string][] = [
  ['normal', 'Normal: keep the full shipping contribution (the discount comes out of margin)'],
  ['reduced', 'Reduced: keep part of the contribution; the gap shows as below target'],
  ['subsidised', 'Subsidised: the campaign budget pays the freight the price no longer covers'],
  ['below_target', 'Below target, approved: keep part, with finance’s approval'],
]
const local = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')
const BLANK = { name: '', starts_at: '', ends_at: '', discount_kind: 'percent', discount_value: '', shipping_treatment: 'normal', keep_pct: '', subsidy_budget: '', max_subsidy_per_item: '', min_margin_pct: '', funding_source: '', notes: '', categories: [] as string[], productIds: [] as string[] }

export default function CampaignsPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<typeof BLANK | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setData(await api('/api/admin/shipping/campaigns')) } catch (e) { setError((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function call(method: 'POST' | 'PUT', json: Record<string, unknown>, done?: (r: any) => string) {
    setError(''); setNotice('')
    try {
      const r = await api('/api/admin/shipping/campaigns', { method, json })
      if (done) setNotice(done(r))
      await load()
      return r
    } catch (e) { setError((e as Error).message); return null }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const r = await call(editing ? 'PUT' : 'POST', { ...form, ...(editing ? { id: editing, action: 'update' } : {}) }, () => 'Campaign saved. Nothing changes in the store until you apply it.')
    if (r) { setForm(null); setEditing(null) }
  }

  function edit(c: any) {
    setEditing(c.id)
    setForm({
      ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, c[k] == null ? (Array.isArray((BLANK as any)[k]) ? [] : '') : Array.isArray(c[k]) ? c[k] : String(c[k])])),
      starts_at: local(c.starts_at), ends_at: local(c.ends_at), productIds: c.products.filter((p: any) => !c.categories.includes(p.category)).map((p: any) => p.productId),
    } as typeof BLANK)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const can = data?.can ?? {}
  const set = (n: string, v: string) => setForm((f) => (f ? { ...f, [n]: v } : f))

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <ShippingHeader title="Clearance" intro="Clearance prices and what they do to freight recovery. Each product is checked at its clearance price before anything goes on sale; ones that would lose money wait for finance’s approval.">
        {can.manage && !form && <button type="button" className={button} onClick={() => { setEditing(null); setForm({ ...BLANK }) }}>New campaign</button>}
      </ShippingHeader>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="ok">{notice}</Alert>}

      {form && (
        <form onSubmit={save} className={`${card} mb-8`}>
          <h2 className="font-semibold">{editing ? 'Edit campaign' : 'New campaign'}</h2>
          {editing && <p className="mt-1 text-xs text-yellow-200">Changing the discount, treatment, budget or dates withdraws any finance approval.</p>}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Input name="name" label="Name" value={form.name} onChange={set} className="col-span-2" />
            <Input name="starts_at" type="datetime-local" label="Starts" value={form.starts_at} onChange={set} />
            <Input name="ends_at" type="datetime-local" label="Ends" value={form.ends_at} onChange={set} />
            <label className={label}>Discount<select value={form.discount_kind} onChange={(e) => set('discount_kind', e.target.value)} className={`${field} mt-1`}><option value="percent">% off</option><option value="fixed">₦ off</option></select></label>
            <Input name="discount_value" type="number" step="0.01" label={form.discount_kind === 'percent' ? 'Percent off' : 'Naira off'} value={form.discount_value} onChange={set} />
            <Input name="min_margin_pct" type="number" step="0.1" label="Margin floor (%, else the store’s)" value={form.min_margin_pct} onChange={set} />
            <Input name="funding_source" label="Funded by" placeholder="e.g. November marketing budget" value={form.funding_source} onChange={set} />
            <label className={`${label} col-span-2 md:col-span-4`}>Shipping
              <select value={form.shipping_treatment} onChange={(e) => set('shipping_treatment', e.target.value)} className={`${field} mt-1`}>{TREATMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            {form.shipping_treatment !== 'normal' && <Input name="keep_pct" type="number" step="1" label="% of the contribution kept" value={form.keep_pct} onChange={set} />}
            {form.shipping_treatment === 'subsidised' && <>
              <Input name="subsidy_budget" type="number" step="0.01" label="Subsidy budget (₦)" value={form.subsidy_budget} onChange={set} />
              <Input name="max_subsidy_per_item" type="number" step="0.01" label="Most per item (₦)" value={form.max_subsidy_per_item} onChange={set} />
            </>}
            <label className={`${label} col-span-2`}>Whole categories
              <select multiple value={form.categories} onChange={(e) => setForm((f) => f && ({ ...f, categories: [...e.target.selectedOptions].map((o) => o.value) }))} className={`${field} mt-1 h-28`}>
                {data?.categories.map((c: string) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className={`${label} col-span-2`}>And these products
              <select multiple value={form.productIds} onChange={(e) => setForm((f) => f && ({ ...f, productIds: [...e.target.selectedOptions].map((o) => o.value) }))} className={`${field} mt-1 h-28`}>
                {data?.products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" className={button}>Save campaign</button>
            <button type="button" onClick={() => { setForm(null); setEditing(null) }} className="text-sm text-final-muted hover:text-final-off-white">Cancel</button>
          </div>
        </form>
      )}

      {data && data.campaigns.length === 0 && <p className="text-sm text-final-muted">No campaigns yet.</p>}
      <div className="space-y-6">
        {data?.campaigns.map((c: any) => {
          const held = c.products.filter((p: any) => p.needsApproval && !p.approved && !p.excluded && !p.applied)
          const needsCampaignApproval = c.shipping_treatment === 'below_target' && !c.approved_at
          return (
            <article key={c.id} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{c.name}</h2>
                <Pill value={c.status === 'active' ? 'verified' : c.status === 'draft' ? 'estimated' : 'missing_data'}>{c.status}</Pill>
              </div>
              <p className="mt-1 text-sm text-final-muted">
                {c.discount_kind === 'percent' ? `${Number(c.discount_value)}% off` : `${naira(Math.round(Number(c.discount_value) * 100))} off`} · {new Date(c.starts_at).toLocaleString('en-NG')} to {new Date(c.ends_at).toLocaleString('en-NG')}
                · shipping {c.shipping_treatment.replace('_', ' ')}{c.keep_pct != null ? ` (keeps ${Number(c.keep_pct)}%)` : ''}
                {c.subsidy_budget != null && ` · subsidy ${naira(c.spentKobo)} of ${naira(Math.round(Number(c.subsidy_budget) * 100))} used`}
                {c.funding_source && ` · funded by ${c.funding_source}`}
              </p>
              {needsCampaignApproval && <Alert tone="warn">Below-target recovery needs finance’s approval before this campaign can start.</Alert>}
              {c.approved_at && <p className="mt-1 text-xs text-emerald-300">Approved {new Date(c.approved_at).toLocaleDateString('en-NG')}: {c.approval_reason}</p>}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs text-final-muted"><tr>{['Product', 'Price', 'Clearance', 'Shipping kept', 'Subsidy', 'Recovers', 'Margin after freight', ''].map((h) => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-final-off-white/5 tabular-nums">
                    {c.products.map((p: any) => (
                      <tr key={p.productId}>
                        <td className="py-1.5 pr-3">{p.name}{p.applied && <span className="ml-2 text-xs text-emerald-300">on sale</span>}{p.excluded && <span className="ml-2 text-xs text-final-muted">excluded</span>}</td>
                        <td className="py-1.5 pr-3">{naira(p.priceKobo)}</td>
                        <td className="py-1.5 pr-3">{naira(p.clearancePriceKobo)}</td>
                        <td className="py-1.5 pr-3">{naira(p.contributionKobo)}</td>
                        <td className="py-1.5 pr-3">{naira(p.subsidyKobo)}</td>
                        <td className="py-1.5 pr-3">{pct(p.recoveryPct)}</td>
                        <td className={`py-1.5 pr-3 ${p.negative ? 'text-final-ember' : p.belowMin ? 'text-yellow-200' : ''}`}>{naira(p.marginAfterFreightKobo)} {p.marginPct != null && <span className="text-xs">({p.marginPct}%)</span>}</td>
                        <td className="py-1.5 text-xs">
                          {p.needsApproval && !p.excluded && (p.approved
                            ? <span className="text-emerald-300" title={p.exceptionReason ?? ''}>approved</span>
                            : can.approve ? <button type="button" className="underline" onClick={() => { const reason = prompt(`Why sell ${p.name} at ${naira(p.clearancePriceKobo)}${p.negative ? ', at a loss' : ''}?`); if (reason) call('PUT', { id: c.id, action: 'approve_product', productId: p.productId, reason }, () => 'Approved.') }}>Approve</button>
                              : <span className="text-yellow-200">{p.marginAfterFreightKobo == null ? 'no cost: needs approval' : 'needs approval'}</span>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {can.approve && needsCampaignApproval && (
                  <button type="button" className={ghost} onClick={() => { const reason = prompt('Why accept below-target freight recovery for this campaign?'); if (reason) call('PUT', { id: c.id, action: 'approve', reason }, () => 'Campaign approved.') }}>Approve below-target recovery</button>
                )}
                {can.manage && c.status !== 'ended' && <>
                  <button type="button" className={button} disabled={needsCampaignApproval} onClick={() => { if (confirm(`Put ${c.name}’s products on sale at their clearance prices now?${held.length ? ` ${held.length} will wait for approval.` : ''}`)) call('PUT', { id: c.id, action: 'apply' }, (r) => `${r.applied.length} on sale${r.held.length ? `; waiting for approval: ${r.held.join(', ')}` : ''}${r.skipped.length ? `; excluded: ${r.skipped.join(', ')}` : ''}.`) }}>Apply clearance prices</button>
                  <button type="button" className={ghost} onClick={() => edit(c)}>Edit</button>
                  {c.status === 'active' && <button type="button" className={ghost} onClick={() => { if (confirm('End the campaign and put prices back as they were?')) call('PUT', { id: c.id, action: 'restore' }, (r) => `${r.restored.length} prices restored${r.changed.length ? `; ${r.changed.length} were changed since and left as they are` : ''}.`) }}>End and restore prices</button>}
                </>}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
