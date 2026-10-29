'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils/format'

type Promo = {
  id: string
  code: string
  description: string | null
  kind: 'percent' | 'fixed'
  value: number
  min_subtotal: number
  starts_at: string | null
  ends_at: string | null
  max_uses: number | null
  once_per_customer: boolean
  active: boolean
  uses: number
  discount_total: number
}

const empty = { code: '', description: '', kind: 'percent', value: '', min_subtotal: '', starts_on: '', ends_on: '', max_uses: '', once_per_customer: true }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })
const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm text-final-off-white focus:border-final-off-white/40 focus:outline-none'

function status(p: Promo) {
  const now = Date.now()
  if (!p.active) return { label: 'Off', tone: 'text-final-muted' }
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return { label: 'Ended', tone: 'text-final-muted' }
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { label: 'Scheduled', tone: 'text-final-off-white' }
  if (p.max_uses != null && p.uses >= p.max_uses) return { label: 'Used up', tone: 'text-final-muted' }
  return { label: 'Live', tone: 'text-final-ember' }
}

export default function PromosPage() {
  const [promos, setPromos] = useState<Promo[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<typeof empty>(empty)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/promos', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Could not load promo codes.')
      setPromos(body.promos)
      setCanWrite(body.canWrite)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(body?.error || 'Could not create the code.')
    setForm(empty)
    load()
  }

  async function toggle(p: Promo) {
    const res = await fetch('/api/admin/promos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, active: !p.active }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(body?.error || 'Could not update the code.')
    load()
  }

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="display text-3xl md:text-4xl">Promo codes</h1>
        <p className="mt-1 text-sm text-final-muted">
          Customers enter these in the cart. The server checks and applies them, so Flutterwave charges exactly the discounted total.
          A use counts only when the order is paid. Sale prices are set on each product instead.
        </p>
      </div>

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}

      {canWrite && (
        <form onSubmit={create} className="mb-8 rounded-xl border border-final-off-white/10 bg-final-gray p-5">
          <h2 className="font-semibold">New code</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm text-final-muted">Code
              <input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                pattern="[A-Za-z0-9_\-]{3,30}" maxLength={30} placeholder="WELCOME10" className={`${field} mt-1 font-mono uppercase`} />
            </label>
            <label className="text-sm text-final-muted">Description (shown to the customer)
              <input value={form.description} onChange={set('description')} maxLength={200} placeholder="10% off your first order" className={`${field} mt-1`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-final-muted">Type
                <select value={form.kind} onChange={set('kind')} className={`${field} mt-1`}>
                  <option value="percent">Percent off</option>
                  <option value="fixed">Amount off (₦)</option>
                </select>
              </label>
              <label className="text-sm text-final-muted">{form.kind === 'percent' ? 'Percent' : 'Amount (₦)'}
                <input required type="number" min="0.01" step="0.01" max={form.kind === 'percent' ? 100 : undefined} value={form.value} onChange={set('value')} className={`${field} mt-1`} />
              </label>
            </div>
            <label className="text-sm text-final-muted">Minimum order (₦, optional)
              <input type="number" min="0" step="0.01" value={form.min_subtotal} onChange={set('min_subtotal')} className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Starts (optional)
              <input type="date" value={form.starts_on} onChange={set('starts_on')} className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Ends (optional, last day it works)
              <input type="date" value={form.ends_on} onChange={set('ends_on')} className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Total uses allowed (optional)
              <input type="number" min="1" step="1" value={form.max_uses} onChange={set('max_uses')} className={`${field} mt-1`} />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-final-off-white/80">
              <input type="checkbox" checked={form.once_per_customer} onChange={set('once_per_customer')} /> One use per customer email
            </label>
          </div>
          <p className="mt-3 text-xs text-final-muted">A discount never takes an order below ₦100, the smallest amount we charge online.</p>
          <button type="submit" disabled={saving} className="btn-primary mt-4 px-5 py-2 disabled:opacity-50">{saving ? 'Creating…' : 'Create code'}</button>
        </form>
      )}

      {loading && !promos.length && <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>}
      {!loading && !promos.length && !error && (
        <div className="rounded-xl border border-dashed border-final-off-white/15 px-6 py-16 text-center">
          <p className="font-semibold">No promo codes yet</p>
          <p className="mt-1 text-sm text-final-muted">Codes you create appear here with how often they’ve been used.</p>
        </div>
      )}

      <ul className="space-y-3">
        {promos.map((p) => {
          const s = status(p)
          return (
            <li key={p.id} className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-lg font-semibold">{p.code} <span className={`ml-2 font-sans text-xs font-normal uppercase tracking-[0.12em] ${s.tone}`}>{s.label}</span></p>
                <p className="text-sm">{p.kind === 'percent' ? `${Number(p.value)}% off` : `${formatCurrency(p.value)} off`}</p>
              </div>
              {p.description && <p className="mt-1 text-sm text-final-muted">{p.description}</p>}
              <p className="mt-2 text-xs text-final-muted">
                {[
                  Number(p.min_subtotal) > 0 ? `Min. order ${formatCurrency(p.min_subtotal)}` : null,
                  p.starts_at ? `From ${day(p.starts_at)}` : null,
                  p.ends_at ? `Until ${day(p.ends_at)}` : null,
                  p.once_per_customer ? 'Once per customer' : 'Reusable',
                  `${p.uses}${p.max_uses != null ? ` of ${p.max_uses}` : ''} used`,
                  p.discount_total > 0 ? `${formatCurrency(p.discount_total)} given` : null,
                ].filter(Boolean).join(' · ')}
              </p>
              {canWrite && (
                <button onClick={() => toggle(p)} className="btn-secondary mt-3 px-4 py-2">{p.active ? 'Switch off' : 'Switch on'}</button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
