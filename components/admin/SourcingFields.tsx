'use client'

import { useState } from 'react'

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

export type Source = { supplier_id: string; listing_url: string; unit_cost: string; cost_currency: string; notes: string }

export const COST_CURRENCIES = ['CNY', 'USD', 'NGN']

/** The editor's form value for a product's sourcing (nulls from the API become empty fields). */
export function toSource(value: Record<string, unknown> | null | undefined): Source {
  const s = (k: string) => (value?.[k] == null ? '' : String(value[k]))
  return { supplier_id: s('supplier_id'), listing_url: s('listing_url'), unit_cost: s('unit_cost'), cost_currency: s('cost_currency') || 'CNY', notes: s('notes') }
}

const field = 'w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-3 py-2 text-sm text-final-off-white focus:outline-none focus:border-final-accent'

export function SourcingFields({ value, onChange, suppliers, onSupplierAdded }: {
  value: Source
  onChange: (next: Source) => void
  suppliers: Supplier[]
  onSupplierAdded: (supplier: Supplier) => void
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

  return (
    <fieldset className="rounded-lg border border-final-light-gray/30 p-4">
      <legend className="px-1 text-sm text-final-off-white/70">Sourcing (staff only, never shown to customers)</legend>
      <div className="space-y-3">
        <div>
          <label className="block text-final-off-white/70 text-xs mb-1" htmlFor="source-supplier">Supplier</label>
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
          <label className="block text-final-off-white/70 text-xs mb-1" htmlFor="source-listing">This product&apos;s listing link</label>
          <input id="source-listing" type="url" value={value.listing_url} onChange={set('listing_url')} placeholder="https://..." className={field} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-final-off-white/70 text-xs mb-1" htmlFor="source-cost">Unit cost</label>
            <input id="source-cost" type="number" step="0.01" min="0" value={value.unit_cost} onChange={set('unit_cost')} className={field} />
          </div>
          <div className="w-28">
            <label className="block text-final-off-white/70 text-xs mb-1" htmlFor="source-currency">Currency</label>
            <select id="source-currency" value={value.cost_currency} onChange={set('cost_currency')} className={field}>
              {COST_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-final-off-white/70 text-xs mb-1" htmlFor="source-notes">Notes (MOQ, variant, shipping…)</label>
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
