'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import { grossMargin, landedCost } from '@/lib/landed-cost'

// Where a product comes from, in the product editor. Staff-only: saved to
// product_sources through /api/admin/products (lib/sourcing), never shown
// in the store.

export type Supplier = {
  id: string
  name: string
  platform: string | null
  url: string | null
  contact: string | null
  notes: string | null
  products: number
}

export type Source = {
  supplier_id: string; listing_url: string; unit_cost: string; cost_currency: string; notes: string
  review_status: string; review_notes: string; incoming_quantity: string; incoming_eta: string; supplier_lead_time_days: string
  image_permission: string; fx_rate: string; shipping_cost_ngn: string; customs_cost_ngn: string; other_cost_ngn: string
}

export const COST_CURRENCIES = ['CNY', 'USD', 'NGN']

const REVIEWS: [string, string][] = [
  ['not_required', 'Not needed (our own or trusted)'],
  ['pending', 'Needs review (keeps it off sale)'],
  ['approved', 'Approved'],
  ['rejected', 'Refused (keeps it off sale)'],
]
const IMAGE_PERMISSIONS: [string, string][] = [['unknown', 'Not confirmed'], ['own', 'Our own photos'], ['supplier_permitted', 'Supplier allows use']]

/** The editor's form value for a product's sourcing (nulls from the API become empty fields). */
export function toSource(value: Record<string, unknown> | null | undefined): Source {
  const s = (k: string) => (value?.[k] == null ? '' : String(value[k]))
  return {
    supplier_id: s('supplier_id'), listing_url: s('listing_url'), unit_cost: s('unit_cost'), cost_currency: s('cost_currency') || 'CNY', notes: s('notes'),
    review_status: s('review_status') || 'not_required', review_notes: s('review_notes'),
    incoming_quantity: s('incoming_quantity') === '0' ? '' : s('incoming_quantity'), incoming_eta: s('incoming_eta'),
    supplier_lead_time_days: s('supplier_lead_time_days'), image_permission: s('image_permission') || 'unknown',
    fx_rate: s('fx_rate'), shipping_cost_ngn: s('shipping_cost_ngn'), customs_cost_ngn: s('customs_cost_ngn'), other_cost_ngn: s('other_cost_ngn'),
  }
}

const field = 'w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-3 py-2 text-sm text-final-off-white focus:outline-none focus:border-final-accent'
const label = 'block text-final-off-white/70 text-xs mb-1'
const num = (v: string) => (v.trim() === '' ? null : Number(v))

export function SourcingFields({ value, onChange, suppliers, onSupplierAdded, price }: {
  value: Source
  onChange: (next: Source) => void
  suppliers: Supplier[]
  onSupplierAdded: (supplier: Supplier) => void
  /** The product's selling price, for the margin. */
  price: number
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', url: '', contact: '' })
  const [busy, setBusy] = useState(false)
  const set = (key: keyof Source) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [key]: e.target.value })

  async function addSupplier() {
    if (!draft.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name, url: draft.url || null, contact: draft.contact || null, platform: guessPlatform(draft.url) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t add the supplier.')
      onSupplierAdded(data.supplier)
      onChange({ ...value, supplier_id: data.supplier.id })
      setDraft({ name: '', url: '', contact: '' })
      setAdding(false)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const chosen = suppliers.find((s) => s.id === value.supplier_id)
  const cost = landedCost({
    unitCost: num(value.unit_cost), currency: value.cost_currency, fxRate: num(value.fx_rate),
    shipping: num(value.shipping_cost_ngn), customs: num(value.customs_cost_ngn), other: num(value.other_cost_ngn),
  })
  const margin = cost.ok ? grossMargin(Number(price) || 0, cost.landed) : null

  return (
    <fieldset className="rounded-lg border border-final-light-gray/30 p-4">
      <legend className="px-1 text-sm text-final-off-white/70">Sourcing (staff only, never shown to customers)</legend>
      <div className="space-y-3">
        <div>
          <label className={label} htmlFor="source-review">Review before sale</label>
          <select id="source-review" value={value.review_status} onChange={set('review_status')} className={field}>
            {REVIEWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <p className="mt-1 text-xs text-final-off-white/50">
            Use &ldquo;Needs review&rdquo; for supplier or imported listings: check the design, branding (no counterfeits or copied logos),
            photos, description and import rules first. Save the product as a draft until it&apos;s approved.
          </p>
          {value.review_status !== 'not_required' && (
            <textarea value={value.review_notes} onChange={set('review_notes')} rows={2} maxLength={2000} placeholder="What was checked, and by whom" className={`${field} mt-2`} />
          )}
        </div>

        <div>
          <label className={label} htmlFor="source-supplier">Supplier</label>
          <div className="flex gap-2">
            <select id="source-supplier" value={value.supplier_id} onChange={set('supplier_id')} className={field}>
              <option value="">No supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.platform ? ` (${s.platform})` : ''}</option>)}
            </select>
            <button type="button" onClick={() => setAdding((a) => !a)} className="shrink-0 rounded-lg border border-final-light-gray/30 px-3 text-sm text-final-off-white hover:border-final-off-white/50">
              {adding ? 'Cancel' : 'New'}
            </button>
          </div>
          {chosen && (chosen.url || chosen.contact) && (
            <p className="mt-1 text-xs text-final-off-white/50">
              {chosen.url && <a href={chosen.url} target="_blank" rel="noreferrer" className="underline hover:text-final-off-white">Supplier page</a>}
              {chosen.url && chosen.contact && ' · '}
              {chosen.contact}
            </p>
          )}
        </div>

        {adding && (
          <div className="space-y-2 rounded-lg bg-final-black/40 p-3">
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Supplier name" className={field} maxLength={120} />
            <input value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} placeholder="Shop or factory link (1688, Alibaba…)" type="url" className={field} />
            <input value={draft.contact} onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))} placeholder="Contact (WhatsApp, WeChat, email…)" className={field} maxLength={300} />
            <button type="button" disabled={busy || !draft.name.trim()} onClick={addSupplier} className="rounded-lg bg-final-off-white px-3 py-1.5 text-sm font-semibold text-final-black disabled:opacity-50">
              {busy ? 'Adding…' : 'Add supplier'}
            </button>
          </div>
        )}

        <div>
          <label className={label} htmlFor="source-listing">This product&apos;s listing link</label>
          <input id="source-listing" type="url" value={value.listing_url} onChange={set('listing_url')} placeholder="https://..." className={field} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor="source-images">Product photos</label>
            <select id="source-images" value={value.image_permission} onChange={set('image_permission')} className={field}>
              {IMAGE_PERMISSIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="source-lead">Supplier lead time (days)</label>
            <input id="source-lead" type="number" min="0" max="365" value={value.supplier_lead_time_days} onChange={set('supplier_lead_time_days')} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="source-incoming">On order, not received</label>
            <input id="source-incoming" type="number" min="0" value={value.incoming_quantity} onChange={set('incoming_quantity')} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="source-eta">Expected</label>
            <input id="source-eta" type="date" value={value.incoming_eta} onChange={set('incoming_eta')} className={field} />
          </div>
        </div>
        <p className="text-xs text-final-off-white/50">Stock on order isn&apos;t sold until it arrives and you add it to Stock (or offer it as a pre-order).</p>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className={label} htmlFor="source-cost">Unit cost</label>
            <input id="source-cost" type="number" step="0.01" min="0" value={value.unit_cost} onChange={set('unit_cost')} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="source-currency">Currency</label>
            <select id="source-currency" value={value.cost_currency} onChange={set('cost_currency')} className={field}>
              {COST_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {value.cost_currency !== 'NGN' && (
            <div className="col-span-3">
              <label className={label} htmlFor="source-fx">Naira per {value.cost_currency} (the rate you paid at)</label>
              <input id="source-fx" type="number" step="0.000001" min="0" value={value.fx_rate} onChange={set('fx_rate')} className={field} />
            </div>
          )}
          <div>
            <label className={label} htmlFor="source-ship">Shipping (₦/unit)</label>
            <input id="source-ship" type="number" step="0.01" min="0" value={value.shipping_cost_ngn} onChange={set('shipping_cost_ngn')} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="source-customs">Customs (₦/unit)</label>
            <input id="source-customs" type="number" step="0.01" min="0" value={value.customs_cost_ngn} onChange={set('customs_cost_ngn')} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="source-other">Other (₦/unit)</label>
            <input id="source-other" type="number" step="0.01" min="0" value={value.other_cost_ngn} onChange={set('other_cost_ngn')} className={field} />
          </div>
        </div>
        <p className="rounded-lg bg-final-black/40 p-3 text-xs text-final-off-white/80">
          {cost.ok && margin
            ? <>Landed cost {formatCurrency(cost.landed)} · gross profit {formatCurrency(margin.profit)}{margin.marginPct != null ? ` (${margin.marginPct}%)` : ''} at {formatCurrency(Number(price) || 0)}. Gross only: ads, payment fees and running costs aren&apos;t included.</>
            : <>Add {cost.ok ? 'a price' : cost.missing} to see the landed cost and margin.</>}
        </p>

        <div>
          <label className={label} htmlFor="source-notes">Notes (MOQ, variant, shipping…)</label>
          <textarea id="source-notes" value={value.notes} onChange={set('notes')} rows={2} maxLength={2000} className={field} />
        </div>
      </div>
    </fieldset>
  )
}

/** Fills in the platform from a pasted link, so most suppliers need only a name. */
export function guessPlatform(url: string) {
  const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
  if (host.endsWith('1688.com')) return '1688'
  if (host.endsWith('alibaba.com')) return 'Alibaba'
  if (host.endsWith('aliexpress.com')) return 'AliExpress'
  if (host.endsWith('taobao.com') || host.endsWith('tmall.com')) return 'Taobao'
  return host ? host.replace(/^www\./, '') : null
}
