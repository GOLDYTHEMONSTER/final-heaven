'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { guessPlatform, type Supplier } from '@/components/admin/SourcingFields'

const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm text-final-off-white focus:border-final-off-white/40 focus:outline-none'
const empty = { name: '', url: '', contact: '', platform: '', notes: '' }

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/suppliers').then(async (res) => {
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t load suppliers.')
      setSuppliers(data.suppliers)
      setCanWrite(Boolean(data.canWrite))
    }).catch((e) => setError((e as Error).message))
  }, [])

  const set = (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function edit(s: Supplier) {
    setEditing(s.id)
    setForm({ name: s.name, url: s.url ?? '', contact: s.contact ?? '', platform: s.platform ?? '', notes: s.notes ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = {
        ...(editing ? { id: editing } : {}),
        name: form.name, url: form.url || null, contact: form.contact || null, notes: form.notes || null,
        platform: form.platform || guessPlatform(form.url),
      }
      const res = await fetch('/api/admin/suppliers', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t save.')
      setSuppliers((list) => {
        const next = editing ? list.map((s) => (s.id === editing ? { ...s, ...data.supplier } : s)) : [...list, data.supplier]
        return next.sort((a, b) => a.name.localeCompare(b.name))
      })
      setForm(empty)
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(s: Supplier) {
    if (!confirm(`Remove ${s.name}? ${s.products ? `Its ${s.products} product${s.products > 1 ? 's' : ''} keep their listing links and costs, but lose the supplier.` : ''}`)) return
    const res = await fetch(`/api/admin/suppliers?id=${s.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) return setError(data?.error || 'Couldn’t remove the supplier.')
    setSuppliers((list) => list.filter((x) => x.id !== s.id))
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="display text-3xl md:text-4xl">Suppliers</h1>
        <p className="mt-1 text-sm text-final-muted">
          Where your products come from. Pick a supplier, the listing link and the unit cost on each product in{' '}
          <Link href="/studio" className="underline underline-offset-2 hover:text-final-off-white">Products</Link>. Staff only; customers never see any of this.
        </p>
      </div>

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}

      {canWrite && (
        <form onSubmit={save} className="mb-8 rounded-xl border border-final-off-white/10 bg-final-gray p-5">
          <h2 className="font-semibold">{editing ? 'Edit supplier' : 'New supplier'}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm text-final-muted">Name
              <input required maxLength={120} value={form.name} onChange={set('name')} placeholder="e.g. Yiwu Iced Jewellery Factory" className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Shop or factory link
              <input type="url" value={form.url} onChange={set('url')} placeholder="https://..." className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Contact
              <input maxLength={300} value={form.contact} onChange={set('contact')} placeholder="WhatsApp, WeChat, email…" className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Platform
              <input maxLength={40} value={form.platform} onChange={set('platform')} placeholder={guessPlatform(form.url) ?? '1688, Alibaba, local…'} className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted sm:col-span-2">Notes
              <textarea maxLength={2000} rows={2} value={form.notes} onChange={set('notes')} placeholder="MOQ, lead time, quality, who you spoke to…" className={`${field} mt-1`} />
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={busy} className="rounded-lg bg-final-off-white px-4 py-2 text-sm font-semibold text-final-black disabled:opacity-50">
              {busy ? 'Saving…' : editing ? 'Save supplier' : 'Add supplier'}
            </button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm(empty) }} className="text-sm text-final-muted hover:text-final-off-white">Cancel</button>}
          </div>
        </form>
      )}

      {suppliers.length === 0 && !error ? (
        <p className="text-sm text-final-muted">No suppliers yet.</p>
      ) : (
        <ul className="space-y-3">
          {suppliers.map((s) => (
            <li key={s.id} className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">
                  {s.name}
                  {s.platform && <span className="ml-2 text-xs font-normal uppercase tracking-[0.12em] text-final-muted">{s.platform}</span>}
                </p>
                <Link href={`/studio?supplier=${s.id}`} className="text-sm underline underline-offset-2 hover:text-final-off-white">
                  {s.products} product{s.products === 1 ? '' : 's'}
                </Link>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-final-muted">
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-final-off-white">Shop link</a>}
                {s.contact && <span>{s.contact}</span>}
              </p>
              {s.notes && <p className="mt-2 whitespace-pre-line text-sm text-final-off-white/80">{s.notes}</p>}
              {canWrite && (
                <div className="mt-3 flex gap-4 text-sm">
                  <button type="button" onClick={() => edit(s)} className="underline underline-offset-2 hover:text-final-off-white">Edit</button>
                  <button type="button" onClick={() => remove(s)} className="text-final-ember underline underline-offset-2">Remove</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
