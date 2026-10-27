'use client'

import { useCallback, useEffect, useState } from 'react'
import { Alert, Input, ShippingHeader, api, button, card, field, label, naira, requestKey } from '@/components/admin/shipping/ui'

const KINDS: [string, string][] = [
  ['freight_recovery', 'Freight recovery'], ['logistics_reserve', 'Logistics reserve'], ['platform_revenue', 'Platform contribution'],
  ['promo_subsidy', 'Campaign subsidy'], ['unfunded_freight', 'Unfunded freight'],
]
const REASONS: Record<string, string> = {
  order_paid: 'Order paid', order_cancelled: 'Order cancelled', order_refunded: 'Order refunded', reconciliation: 'Reconciliation',
  reserve_draw: 'Drawn from reserve', manual_adjustment: 'Manual adjustment',
}

export default function LedgerPage() {
  const [kind, setKind] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ kind: 'logistics_reserve', direction: 'increase', amount: '', memo: '', key: requestKey() })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setData(await api(`/api/admin/shipping/ledger?page=${page}${kind ? `&kind=${kind}` : ''}`)) } catch (e) { setError((e as Error).message) }
  }, [kind, page])
  useEffect(() => { load() }, [load])

  async function adjust(e: React.FormEvent) {
    e.preventDefault()
    if (!confirm('Add this entry? Ledger entries can’t be edited or removed; a mistake is corrected with another entry.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await api('/api/admin/shipping/ledger', { method: 'POST', json: form })
      setNotice(r.duplicate ? 'That entry was already recorded.' : 'Entry recorded.')
      setForm({ kind: form.kind, direction: 'increase', amount: '', memo: '', key: requestKey() })
      await load()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <ShippingHeader title="Ledger" intro="Every amount set aside for freight, the reserve, the platform and campaigns, and every shortfall. Entries are never edited: cancellations and refunds add reversing entries.">
        <select aria-label="Kind" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }} className={`${field} max-w-xs`}>
          <option value="">All kinds</option>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </ShippingHeader>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="ok">{notice}</Alert>}

      {data?.can?.adjust && (
        <details className={`${card} mb-6`}>
          <summary className="cursor-pointer text-sm font-medium">Manual adjustment</summary>
          <form onSubmit={adjust} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <label className={label}>Kind<select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} className={`${field} mt-1`}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className={label}>Direction<select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))} className={`${field} mt-1`}><option value="increase">Increase</option><option value="decrease">Decrease</option></select></label>
            <Input name="amount" type="number" step="0.01" label="Amount (₦)" value={form.amount} onChange={(n, v) => setForm((f) => ({ ...f, [n]: v }))} />
            <Input name="memo" label="Reason (required)" className="col-span-2" value={form.memo} onChange={(n, v) => setForm((f) => ({ ...f, [n]: v }))} />
            <div className="col-span-2"><button type="submit" disabled={busy || !form.amount || form.memo.trim().length < 5} className={button}>{busy ? 'Recording…' : 'Record entry'}</button></div>
          </form>
        </details>
      )}

      {data && data.entries.length === 0 && <p className="text-sm text-final-muted">Nothing recorded yet. Entries appear when orders are paid.</p>}
      {data && data.entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-final-off-white/10">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-final-gray text-xs text-final-muted"><tr>{['When', 'Kind', 'Amount', 'Why', 'For', 'Note'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-final-off-white/5">
              {data.entries.map((e: any) => (
                <tr key={e.id}>
                  <td className="px-3 py-1.5 text-xs text-final-muted">{new Date(e.occurred_at).toLocaleString('en-NG')}</td>
                  <td className="px-3 py-1.5">{KINDS.find(([v]) => v === e.kind)?.[1]}</td>
                  <td className={`px-3 py-1.5 tabular-nums ${Number(e.amount) < 0 ? 'text-final-ember' : ''}`}>{naira(Math.round(Number(e.amount) * 100), { sign: true })}</td>
                  <td className="px-3 py-1.5">{REASONS[e.reason] ?? e.reason}</td>
                  <td className="px-3 py-1.5 text-xs">{[e.order?.order_number, e.shipment?.reference, e.campaign?.name, e.product_id].filter(Boolean).join(' · ')}</td>
                  <td className="px-3 py-1.5 text-xs text-final-muted">{e.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > 100 && (
        <div className="mt-4 flex gap-3 text-sm">
          <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="underline disabled:opacity-40">Newer</button>
          <button type="button" disabled={page * 100 >= data.total} onClick={() => setPage((p) => p + 1)} className="underline disabled:opacity-40">Older</button>
        </div>
      )}
    </div>
  )
}
