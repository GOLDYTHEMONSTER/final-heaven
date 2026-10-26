'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Brand = {
  id: string; name: string; slug: string; description: string | null; logo_url: string | null
  website: string | null; status: 'draft' | 'published'; products: number
}

const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm text-final-off-white focus:border-final-off-white/40 focus:outline-none'
const empty = { name: '', description: '', logo_url: '', website: '', status: 'draft' as Brand['status'] }

/** Independent labels sold in the store. Only published labels show to customers, so only real partnerships ever appear. */
export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/brands').then(async (res) => {
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t load labels.')
      setBrands(data.brands)
      setCanWrite(Boolean(data.canWrite))
    }).catch((e) => setError((e as Error).message))
  }, [])

  const set = (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function edit(b: Brand) {
    setEditing(b.id)
    setForm({ name: b.name, description: b.description ?? '', logo_url: b.logo_url ?? '', website: b.website ?? '', status: b.status })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = {
        ...(editing ? { id: editing } : {}),
        name: form.name, description: form.description || null, logo_url: form.logo_url || null, website: form.website || null, status: form.status,
      }
      const res = await fetch('/api/admin/brands', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t save.')
      setBrands((list) => (editing ? list.map((b) => (b.id === editing ? { ...b, ...data.brand } : b)) : [...list, data.brand]).sort((a, b) => a.name.localeCompare(b.name)))
      setForm(empty)
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(b: Brand) {
    if (!confirm(`Remove ${b.name}?${b.products ? ` Its ${b.products} product${b.products > 1 ? 's' : ''} stay in the store, without a label.` : ''}`)) return
    const res = await fetch(`/api/admin/brands?id=${b.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) return setError(data?.error || 'Couldn’t remove the label.')
    setBrands((list) => list.filter((x) => x.id !== b.id))
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="display text-3xl md:text-4xl">Labels</h1>
        <p className="mt-1 text-sm text-final-muted">
          Independent brands you stock. Add a label here, then pick it on each of its products in{' '}
          <Link href="/admin" className="underline underline-offset-2 hover:text-final-off-white">Products</Link>. A label shows in the store
          (with its own page) only once it&apos;s published, so only list partnerships that are real.
        </p>
      </div>

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}

      {canWrite && (
        <form onSubmit={save} className="mb-8 rounded-xl border border-final-off-white/10 bg-final-gray p-5">
          <h2 className="font-semibold">{editing ? 'Edit label' : 'New label'}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm text-final-muted">Name
              <input required maxLength={80} value={form.name} onChange={set('name')} className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Status
              <select value={form.status} onChange={set('status')} className={`${field} mt-1`}>
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label className="text-sm text-final-muted">Logo image link
              <input type="url" value={form.logo_url} onChange={set('logo_url')} placeholder="https://…" className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Their website or Instagram
              <input type="url" value={form.website} onChange={set('website')} placeholder="https://…" className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted sm:col-span-2">About them
              <textarea maxLength={600} rows={3} value={form.description} onChange={set('description')} className={`${field} mt-1`} />
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={busy} className="rounded-lg bg-final-off-white px-4 py-2 text-sm font-semibold text-final-black disabled:opacity-50">
              {busy ? 'Saving…' : editing ? 'Save label' : 'Add label'}
            </button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm(empty) }} className="text-sm text-final-muted hover:text-final-off-white">Cancel</button>}
          </div>
        </form>
      )}

      {brands.length === 0 && !error ? (
        <p className="text-sm text-final-muted">No labels yet.</p>
      ) : (
        <ul className="space-y-3">
          {brands.map((b) => (
            <li key={b.id} className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">
                  {b.name}
                  <span className={`ml-2 text-xs font-normal uppercase tracking-[0.12em] ${b.status === 'published' ? 'text-green-400' : 'text-final-muted'}`}>{b.status}</span>
                </p>
                <span className="text-sm text-final-muted">{b.products} product{b.products === 1 ? '' : 's'}</span>
              </div>
              {b.description && <p className="mt-2 text-sm text-final-off-white/80">{b.description}</p>}
              <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-final-muted">
                {b.status === 'published' && <a href={`/brands/${b.slug}`} target="_blank" rel="noreferrer" className="underline hover:text-final-off-white">Store page</a>}
                {b.website && <a href={b.website} target="_blank" rel="noreferrer" className="underline hover:text-final-off-white">Website</a>}
              </p>
              {canWrite && (
                <div className="mt-3 flex gap-4 text-sm">
                  <button type="button" onClick={() => edit(b)} className="underline underline-offset-2 hover:text-final-off-white">Edit</button>
                  <button type="button" onClick={() => remove(b)} className="text-final-ember underline underline-offset-2">Remove</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
