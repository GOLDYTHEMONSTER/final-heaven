'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { FiArrowDown, FiArrowUp, FiX } from 'react-icons/fi'
import { sized } from '@/lib/images'
import { formatCurrency } from '@/lib/utils/format'
import { SOURCE_TYPES, matchesRule, parseRule, type CollectionRule } from '@/lib/collections'
import type { Product } from '@/lib/catalog'

type Row = Record<string, any>
type CollectionRow = {
  id: string; title: string; slug: string; description: string | null; cover_image: string | null; rule: CollectionRule | null
  status: 'draft' | 'published'; featured: boolean; sort_order: number; starts_at: string | null; ends_at: string | null
  links: { product_id: string; position: number }[]
}
type Form = {
  title: string; description: string; cover_image: string; status: 'draft' | 'published'; featured: boolean; sort_order: string
  starts_at: string; ends_at: string; picked: string[]
  categories: string[]; sources: string[]; tags: string; minPrice: string; maxPrice: string; brandId: string; newOnly: boolean
}

const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm text-final-off-white focus:border-final-off-white/40 focus:outline-none'
const SOURCE_NAMES: Record<string, string> = {
  original: 'Originals', wholesale: 'Wholesale', distributor: 'Distributors', local_maker: 'Local makers', independent: 'Labels',
}
const empty: Form = {
  title: '', description: '', cover_image: '', status: 'draft', featured: false, sort_order: '0', starts_at: '', ends_at: '', picked: [],
  categories: [], sources: [], tags: '', minPrice: '', maxPrice: '', brandId: '', newOnly: false,
}

/** A datetime-local value for an ISO time, in the browser's time zone. */
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')
/** The storefront view of an admin product row, for previewing rules. */
const asProduct = (r: Row): Product => ({
  id: r.id, name: r.name, price: Number(r.price), category: r.category, stock: r.stock, status: r.status, tags: r.tags ?? [],
  sourceType: r.source_type ?? 'original', isNew: r.is_new, createdAt: r.created_at, brand: r.brand_id ? { id: r.brand_id, name: '', slug: '' } : undefined,
  images: r.images ?? [],
})

function ruleOf(f: Form): CollectionRule | null {
  return parseRule({
    categories: f.categories, sources: f.sources, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    minPrice: f.minPrice ? Number(f.minPrice) : undefined, maxPrice: f.maxPrice ? Number(f.maxPrice) : undefined,
    brandId: f.brandId || undefined, newOnly: f.newOnly || undefined,
  })
}

function toForm(c: CollectionRow): Form {
  const r = c.rule ?? {}
  return {
    title: c.title, description: c.description ?? '', cover_image: c.cover_image ?? '', status: c.status, featured: c.featured,
    sort_order: String(c.sort_order ?? 0), starts_at: local(c.starts_at), ends_at: local(c.ends_at),
    picked: [...(c.links ?? [])].sort((a, b) => a.position - b.position).map((l) => l.product_id),
    categories: r.categories ?? [], sources: r.sources ?? [], tags: (r.tags ?? []).join(', '),
    minPrice: r.minPrice != null ? String(r.minPrice) : '', maxPrice: r.maxPrice != null ? String(r.maxPrice) : '',
    brandId: r.brandId ?? '', newOnly: Boolean(r.newOnly),
  }
}

/** Collections: curated groups for "Shop by mood", drops and edits. Products are linked, never copied. */
export default function CollectionsAdminPage() {
  const [collections, setCollections] = useState<CollectionRow[]>([])
  const [products, setProducts] = useState<Row[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [form, setForm] = useState<Form>(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const json = async (path: string) => {
      const res = await fetch(path)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t load.')
      return data
    }
    Promise.all([json('/api/admin/collections'), json('/api/admin/products'), json('/api/admin/brands')]).then(([c, p, b]) => {
      setCollections(c.collections)
      setCanWrite(Boolean(c.canWrite))
      setProducts(p.products ?? [])
      setBrands(b.brands ?? [])
    }).catch((e) => setError((e as Error).message))
  }, [])

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(), [products])
  // What customers will see: active products only, hand-picked first, then the rule's matches.
  const preview = useMemo(() => {
    const active = products.filter((p) => p.status === 'active').map(asProduct)
    const picked = form.picked.filter((id) => byId.get(id)?.status === 'active')
    const rule = ruleOf(form)
    const byRule = rule ? active.filter((p) => !picked.includes(p.id) && matchesRule(p, rule)).length : 0
    return { picked: picked.length, byRule }
  }, [products, byId, form])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const toggle = (key: 'categories' | 'sources', value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }))
  const move = (i: number, by: number) => setForm((f) => {
    const picked = [...f.picked]
    const j = i + by
    if (j < 0 || j >= picked.length) return f
    ;[picked[i], picked[j]] = [picked[j], picked[i]]
    return { ...f, picked }
  })

  function start(c?: CollectionRow) {
    setEditing(c?.id ?? null)
    setForm(c ? toForm(c) : empty)
    setOpen(true)
    setSearch('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = {
        ...(editing ? { id: editing } : {}),
        title: form.title, description: form.description || null, cover_image: form.cover_image || null, status: form.status,
        featured: form.featured, sort_order: Number(form.sort_order) || 0,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        rule: ruleOf(form), product_ids: form.picked,
      }
      const res = await fetch('/api/admin/collections', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t save.')
      setCollections((list) => editing ? list.map((c) => (c.id === editing ? data.collection : c)) : [...list, data.collection])
      setOpen(false)
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: CollectionRow) {
    if (!confirm(`Remove the collection “${c.title}”? Its products stay in the store.`)) return
    const res = await fetch(`/api/admin/collections?id=${c.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) return setError(data?.error || 'Couldn’t remove it.')
    setCollections((list) => list.filter((x) => x.id !== c.id))
  }

  const matches = search.trim()
    ? products.filter((p) => !form.picked.includes(p.id) && p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12)
    : []

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl md:text-4xl">Collections</h1>
          <p className="mt-1 max-w-2xl text-sm text-final-muted">
            Curated groups for the homepage&apos;s &ldquo;Shop by mood&rdquo; and their own pages. Pick products by hand, set a rule
            (category, source, price, tag), or both. Products are linked, not copied. Only published collections inside their dates show.
          </p>
        </div>
        {canWrite && !open && (
          <button type="button" onClick={() => start()} className="rounded-lg bg-final-off-white px-4 py-2 text-sm font-semibold text-final-black">
            New collection
          </button>
        )}
      </div>

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}

      {open && canWrite && (
        <form onSubmit={save} className="mb-10 space-y-6 rounded-xl border border-final-off-white/10 bg-final-gray p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{editing ? 'Edit collection' : 'New collection'}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-final-muted hover:text-final-off-white"><FiX className="h-5 w-5" /></button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm text-final-muted">Title
              <input required maxLength={80} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="After Hours" className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Status
              <select value={form.status} onChange={(e) => set('status', e.target.value as Form['status'])} className={`${field} mt-1`}>
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label className="text-sm text-final-muted sm:col-span-2">Description
              <textarea maxLength={600} rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Cover image link (optional: otherwise its first four products)
              <input type="url" value={form.cover_image} onChange={(e) => set('cover_image', e.target.value)} placeholder="https://… or /editorial/…" className={`${field} mt-1`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-final-muted">Order
                <input type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className="mt-6 flex items-center gap-2 text-sm text-final-muted">
                <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} className="h-4 w-4 accent-final-off-white" /> Featured
              </label>
            </div>
            <label className="text-sm text-final-muted">Shows from (optional)
              <input type="datetime-local" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="text-sm text-final-muted">Until (optional)
              <input type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} className={`${field} mt-1`} />
            </label>
          </div>

          <fieldset className="rounded-lg border border-final-off-white/10 p-4">
            <legend className="px-1 text-sm text-final-off-white/70">Rule: include every product that matches (optional)</legend>
            <p className="text-xs text-final-muted">Categories</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c} type="button" aria-pressed={form.categories.includes(c)} onClick={() => toggle('categories', c)}
                  className={`rounded-full border px-3 py-1 text-xs ${form.categories.includes(c) ? 'border-final-off-white bg-final-off-white text-final-black' : 'border-final-off-white/20'}`}>{c}</button>
              ))}
            </div>
            <p className="mt-3 text-xs text-final-muted">From</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {SOURCE_TYPES.map((s) => (
                <button key={s} type="button" aria-pressed={form.sources.includes(s)} onClick={() => toggle('sources', s)}
                  className={`rounded-full border px-3 py-1 text-xs ${form.sources.includes(s) ? 'border-final-off-white bg-final-off-white text-final-black' : 'border-final-off-white/20'}`}>{SOURCE_NAMES[s]}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <label className="text-xs text-final-muted sm:col-span-2">Tags (any of, comma-separated)
                <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="after-hours, chrome" className={`${field} mt-1`} />
              </label>
              <label className="text-xs text-final-muted">Min price (₦)
                <input type="number" min={0} value={form.minPrice} onChange={(e) => set('minPrice', e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className="text-xs text-final-muted">Max price (₦)
                <input type="number" min={0} value={form.maxPrice} onChange={(e) => set('maxPrice', e.target.value)} className={`${field} mt-1`} />
              </label>
              {brands.length > 0 && (
                <label className="text-xs text-final-muted sm:col-span-2">Label
                  <select value={form.brandId} onChange={(e) => set('brandId', e.target.value)} className={`${field} mt-1`}>
                    <option value="">Any</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
              )}
              <label className="mt-5 flex items-center gap-2 text-xs text-final-muted">
                <input type="checkbox" checked={form.newOnly} onChange={(e) => set('newOnly', e.target.checked)} className="h-4 w-4 accent-final-off-white" /> New in only
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-final-off-white/10 p-4">
            <legend className="px-1 text-sm text-final-off-white/70">Hand-picked products, shown first in this order</legend>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products to add…" className={field} />
            {matches.length > 0 && (
              <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-final-off-white/10">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => { set('picked', [...form.picked, p.id]); setSearch('') }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-final-black/40">
                      <span className="relative h-10 w-8 shrink-0 overflow-hidden rounded bg-final-black">
                        {p.images?.[0]?.url && <Image src={sized(p.images[0].url, 640)} alt="" fill unoptimized sizes="32px" className="object-cover" />}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-final-muted">{p.status === 'active' ? formatCurrency(Number(p.price)) : p.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {form.picked.length > 0 && (
              <ol className="mt-3 space-y-1">
                {form.picked.map((id, i) => {
                  const p = byId.get(id)
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg bg-final-black/40 px-3 py-2 text-sm">
                      <span className="w-6 text-final-muted">{i + 1}</span>
                      <span className="flex-1 truncate">{p?.name ?? 'Deleted product'}{p && p.status !== 'active' && <span className="ml-2 text-xs text-yellow-400">({p.status}, hidden)</span>}</span>
                      <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="p-1 text-final-muted hover:text-final-off-white"><FiArrowUp /></button>
                      <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="p-1 text-final-muted hover:text-final-off-white"><FiArrowDown /></button>
                      <button type="button" aria-label="Remove" onClick={() => set('picked', form.picked.filter((x) => x !== id))} className="p-1 text-final-ember"><FiX /></button>
                    </li>
                  )
                })}
              </ol>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy} className="rounded-lg bg-final-off-white px-4 py-2 text-sm font-semibold text-final-black disabled:opacity-50">
              {busy ? 'Saving…' : editing ? 'Save collection' : 'Create collection'}
            </button>
            <p className="text-sm text-final-muted">
              Customers will see {preview.picked + preview.byRule} product{preview.picked + preview.byRule === 1 ? '' : 's'}
              {preview.byRule > 0 && preview.picked > 0 ? ` (${preview.picked} picked, ${preview.byRule} by the rule)` : ''}.
              {preview.picked + preview.byRule === 0 && ' A collection with nothing in it stays off the homepage.'}
            </p>
          </div>
        </form>
      )}

      {collections.length === 0 && !error ? (
        <p className="text-sm text-final-muted">No collections yet.</p>
      ) : (
        <ul className="space-y-3">
          {collections.map((c) => (
            <li key={c.id} className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">
                  {c.title}
                  <span className={`ml-2 text-xs font-normal uppercase tracking-[0.12em] ${c.status === 'published' ? 'text-green-400' : 'text-final-muted'}`}>{c.status}</span>
                  {c.featured && <span className="ml-2 text-xs font-normal uppercase tracking-[0.12em] text-final-ember">featured</span>}
                </p>
                <span className="text-sm text-final-muted">
                  {c.links?.length ?? 0} picked{c.rule ? ' + rule' : ''}
                </span>
              </div>
              {c.description && <p className="mt-1 text-sm text-final-off-white/80">{c.description}</p>}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {c.status === 'published' && <Link href={`/collections/${c.slug}`} target="_blank" className="underline underline-offset-2 hover:text-final-off-white">Store page</Link>}
                {canWrite && <button type="button" onClick={() => start(c)} className="underline underline-offset-2 hover:text-final-off-white">Edit</button>}
                {canWrite && <button type="button" onClick={() => remove(c)} className="text-final-ember underline underline-offset-2">Remove</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
