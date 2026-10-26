'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FiRotateCw, FiSearch, FiSliders, FiX } from 'react-icons/fi'
import { ProductCard } from '@/components/ui/ProductCard'
import { useInterestStore } from '@/lib/stores/interestStore'
import { EMPTY_PROFILE, FEED_SEED_KEY, buildProfile, rankProducts, type FeedProfile } from '@/lib/discovery'
import type { Product } from '@/lib/catalog'

/* ── Shop ────────────────────────────────────────────────────────
 * The whole catalogue with search, category chips, filters and sorting.
 * Every choice lives in the URL, so a filtered view can be shared and Back
 * returns to it. Filters are built from what the products actually have:
 * no empty categories, no sizes nobody stocks.
 * ─────────────────────────────────────────────────────────────── */

type Status = 'loading' | 'ready' | 'error'
type Sort = 'featured' | 'newest' | 'price-asc' | 'price-desc'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]

/** Tags that are collections, shown as chips. */
const COLLECTIONS: Record<string, string> = { 'drop-01': 'Drop 01' }

/** Where pieces come from, as shoppers see it: ours, an independent label's, or curated by us (how it was sourced stays internal). */
const SOURCE_GROUPS = ['original', 'independent', 'curated'] as const
const SOURCE_NAMES: Record<string, string> = { original: 'Final Heaven Originals', independent: 'Independent labels', curated: 'Curated' }
const sourceGroup = (p: Product) => (p.sourceType === 'original' || !p.sourceType ? 'original' : p.sourceType === 'independent' ? 'independent' : 'curated')

const SCROLL_KEY = 'fh-shop-scroll'

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])
const isSet = (p: Product) => p.tags?.includes('set')
const buyable = (p: Product) => p.purchase?.state === 'available' || p.purchase?.state === 'preorder'

function matches(p: Product, q: string) {
  if (!q) return true
  const hay = [p.name, p.category, p.description, p.brand?.name, ...(p.tags ?? []), ...(p.colors ?? [])].join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word))
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`h-9 shrink-0 rounded-full border px-4 text-sm transition-colors duration-200 ${
        active ? 'border-final-off-white bg-final-off-white text-final-black' : 'border-final-light-gray/60 text-final-off-white hover:border-final-off-white/60'
      }`}>
      {children}
    </button>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-final-light-gray/40 pt-5">
      <legend className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-final-muted">{title}</legend>
      {children}
    </fieldset>
  )
}

export function ShopView() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const addFavoriteCategory = useInterestStore((s) => s.addFavoriteCategory)
  const addToSearchHistory = useInterestStore((s) => s.addToSearchHistory)

  const [products, setProducts] = useState<Product[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [sheetOpen, setSheetOpen] = useState(false)

  // Featured uses the homepage feed's ranking for this shopper, fixed for the visit
  // so the order doesn't reshuffle while they browse.
  const [featured, setFeatured] = useState<{ seed: number; profile: FeedProfile }>({ seed: 1, profile: EMPTY_PROFILE })
  useEffect(() => {
    let seed = 1
    try { seed = Number(sessionStorage.getItem(FEED_SEED_KEY)) || 1 } catch {}
    setFeatured({ seed, profile: buildProfile(useInterestStore.getState().interests) })
  }, [])

  // The URL is the state.
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const collection = params.get('collection') ?? ''
  const onlyNew = params.get('new') === '1'
  const sizeParam = params.get('size')
  const colorParam = params.get('color')
  const sizes = useMemo(() => csv(sizeParam), [sizeParam])
  const colors = useMemo(() => csv(colorParam), [colorParam])
  const sourceParam = params.get('source')
  const sources = useMemo(() => csv(sourceParam), [sourceParam])
  const readyOnly = params.get('ready') === '1'
  const brand = params.get('brand') ?? ''
  const inStock = params.get('instock') === '1'
  const min = Number(params.get('min')) || 0
  const max = Number(params.get('max')) || 0
  const sort = (SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort') : 'featured') as Sort

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, pathname, router])

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/products')
      if (!res.ok) throw new Error(`Request failed with ${res.status}`)
      setProducts((await res.json()).products ?? [])
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])
  useEffect(() => { load() }, [load])

  // Search box: typed text goes to the URL after a short pause.
  const [text, setText] = useState(q)
  useEffect(() => setText(q), [q])
  useEffect(() => {
    if (text === q) return
    const t = setTimeout(() => {
      setParams({ q: text.trim() || null })
      if (text.trim().length >= 2) addToSearchHistory(text.trim())
    }, 250)
    return () => clearTimeout(t)
  }, [text, q, setParams, addToSearchHistory])

  // What the catalogue actually has, for chips and filters.
  const facets = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of products) count.set(p.category, (count.get(p.category) ?? 0) + 1)
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
    const allSizes = Array.from(new Set(products.flatMap((p) => p.sizes ?? [])))
      .sort((a, b) => (sizeOrder.indexOf(a) + 1 || 99) - (sizeOrder.indexOf(b) + 1 || 99))
    return {
      categories: Array.from(count.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c),
      collections: Object.keys(COLLECTIONS).filter((t) => products.some((p) => p.tags?.includes(t))),
      sizes: allSizes,
      // A set's options are its picks, not colours.
      colors: Array.from(new Set(products.filter((p) => !isSet(p)).flatMap((p) => p.colors ?? []))).sort(),
      hasNew: products.some((p) => p.isNew),
      sources: SOURCE_GROUPS.filter((g) => products.some((p) => sourceGroup(p) === g)),
      madeToOrder: products.some((p) => p.fulfilment === 'made_to_order'),
      brands: Array.from(new Map(products.filter((p) => p.brand).map((p) => [p.brand!.slug, p.brand!.name])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    }
  }, [products])

  const results = useMemo(() => {
    const filtered = products.filter((p) =>
      matches(p, q)
      && (!category || p.category === category)
      && (!collection || p.tags?.includes(collection))
      && (!onlyNew || p.isNew)
      && (!sizes.length || sizes.some((s) => p.sizes?.includes(s)))
      && (!colors.length || colors.some((c) => p.colors?.includes(c)))
      && (!sources.length || sources.includes(sourceGroup(p)))
      && (!readyOnly || (p.fulfilment !== 'made_to_order' && p.purchase?.state === 'available'))
      && (!brand || p.brand?.slug === brand)
      && (!inStock || buyable(p))
      && (!min || p.price >= min)
      && (!max || p.price <= max))
    switch (sort) {
      case 'newest': return [...filtered].sort((a, b) => Date.parse(b.createdAt ?? '0') - Date.parse(a.createdAt ?? '0'))
      case 'price-asc': return [...filtered].sort((a, b) => a.price - b.price)
      case 'price-desc': return [...filtered].sort((a, b) => b.price - a.price)
      default: return rankProducts(filtered, featured.profile, { seed: featured.seed, freshFirst: true })
    }
  }, [products, q, category, collection, onlyNew, sizes, colors, sources, readyOnly, brand, inStock, min, max, sort, featured])

  // Back from a product: return to where you were in the list.
  useEffect(() => {
    if (status !== 'ready') return
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? 'null')
      if (saved && saved.url === location.pathname + location.search) {
        requestAnimationFrame(() => window.scrollTo(0, saved.y))
        sessionStorage.removeItem(SCROLL_KEY)
      }
    } catch {}
  }, [status])
  const rememberScroll = () => {
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ url: location.pathname + location.search, y: window.scrollY })) } catch {}
  }

  // Bottom sheet: Escape closes it, and the page behind doesn't scroll.
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!sheetOpen) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheetOpen(false)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', onKey) }
  }, [sheetOpen])

  const toggleIn = (key: 'size' | 'color' | 'source', list: string[], value: string) =>
    setParams({ [key]: (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]).join(',') || null })

  const active: { label: string; clear: () => void }[] = [
    ...(q ? [{ label: `“${q}”`, clear: () => setParams({ q: null }) }] : []),
    ...(category ? [{ label: category, clear: () => setParams({ category: null }) }] : []),
    ...(collection ? [{ label: COLLECTIONS[collection] ?? collection, clear: () => setParams({ collection: null }) }] : []),
    ...(onlyNew ? [{ label: 'New in', clear: () => setParams({ new: null }) }] : []),
    ...sizes.map((s) => ({ label: `Size ${s}`, clear: () => toggleIn('size', sizes, s) })),
    ...colors.map((c) => ({ label: c, clear: () => toggleIn('color', colors, c) })),
    ...sources.map((v) => ({ label: SOURCE_NAMES[v] ?? v, clear: () => toggleIn('source', sources, v) })),
    ...(readyOnly ? [{ label: 'Ready to ship', clear: () => setParams({ ready: null }) }] : []),
    ...(brand ? [{ label: facets.brands.find(([slug]) => slug === brand)?.[1] ?? brand, clear: () => setParams({ brand: null }) }] : []),
    ...(inStock ? [{ label: 'In stock', clear: () => setParams({ instock: null }) }] : []),
    ...(min || max ? [{ label: `₦${min.toLocaleString()} – ${max ? `₦${max.toLocaleString()}` : 'any'}`, clear: () => setParams({ min: null, max: null }) }] : []),
  ]
  const clearAll = () => router.replace(pathname, { scroll: false })
  const filterCount = sizes.length + colors.length + sources.length + (readyOnly ? 1 : 0) + (brand ? 1 : 0) + (inStock ? 1 : 0) + (min || max ? 1 : 0)

  const filters = (
    <div className="space-y-6">
      {facets.sources.length > 1 && (
        <FilterGroup title="From">
          <div className="flex flex-wrap gap-2">
            {facets.sources.map((v) => <Chip key={v} active={sources.includes(v)} onClick={() => toggleIn('source', sources, v)}>{SOURCE_NAMES[v]}</Chip>)}
          </div>
        </FilterGroup>
      )}
      {facets.brands.length > 0 && (
        <FilterGroup title="Label">
          <div className="flex flex-wrap gap-2">
            {facets.brands.map(([slug, name]) => <Chip key={slug} active={brand === slug} onClick={() => setParams({ brand: brand === slug ? null : slug })}>{name}</Chip>)}
          </div>
        </FilterGroup>
      )}
      {facets.sizes.length > 1 && (
        <FilterGroup title="Size">
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => <Chip key={s} active={sizes.includes(s)} onClick={() => toggleIn('size', sizes, s)}>{s}</Chip>)}
          </div>
        </FilterGroup>
      )}
      {facets.colors.length > 1 && (
        <FilterGroup title="Colour">
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((c) => <Chip key={c} active={colors.includes(c)} onClick={() => toggleIn('color', colors, c)}><span className="capitalize">{c}</span></Chip>)}
          </div>
        </FilterGroup>
      )}
      <FilterGroup title="Price (₦)">
        {/* Keyed on the range, so clearing it from its chip empties the boxes too. */}
        <div key={`${min}-${max}`} className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min={0} aria-label="Minimum price" placeholder="Min" defaultValue={min || ''}
            onBlur={(e) => setParams({ min: Number(e.target.value) > 0 ? String(Number(e.target.value)) : null })}
            className="h-10 w-full rounded-lg border border-final-light-gray/60 bg-final-gray px-3 text-sm focus:border-final-off-white focus:outline-none" />
          <span className="text-final-muted">–</span>
          <input type="number" inputMode="numeric" min={0} aria-label="Maximum price" placeholder="Max" defaultValue={max || ''}
            onBlur={(e) => setParams({ max: Number(e.target.value) > 0 ? String(Number(e.target.value)) : null })}
            className="h-10 w-full rounded-lg border border-final-light-gray/60 bg-final-gray px-3 text-sm focus:border-final-off-white focus:outline-none" />
        </div>
      </FilterGroup>
      <FilterGroup title="Availability">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={inStock} onChange={(e) => setParams({ instock: e.target.checked ? '1' : null })} className="h-4 w-4 accent-final-off-white" />
          In stock only
        </label>
        {facets.madeToOrder && (
          <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={readyOnly} onChange={(e) => setParams({ ready: e.target.checked ? '1' : null })} className="h-4 w-4 accent-final-off-white" />
            Ready to ship (not made to order)
          </label>
        )}
      </FilterGroup>
    </div>
  )

  return (
    <div className="min-h-screen bg-final-black pt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Compact header: the products start high on the page. */}
        <div className="flex flex-wrap items-end justify-between gap-4 pt-6">
          <div>
            <h1 className="display text-4xl md:text-6xl">Shop <span className="heading-muted">all</span></h1>
            <p className="mt-2 text-sm text-final-muted">
              {status === 'ready' ? `${products.length} pieces` : ' '}
              {facets.collections.includes('drop-01') && (
                <> · <Link href="/drop-01" className="text-final-off-white underline underline-offset-4">Drop 01 is live</Link></>
              )}
            </p>
          </div>
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Search the shop</span>
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-final-muted" />
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search tees, hoodies, angel…"
              className="h-11 w-full rounded-full border border-final-light-gray/60 bg-final-gray pl-9 pr-4 text-sm placeholder:text-final-muted focus:border-final-off-white focus:outline-none" />
          </label>
        </div>

        {/* Category chips: one row, scrolls sideways on small screens. */}
        <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip active={!category && !collection && !onlyNew} onClick={() => setParams({ category: null, collection: null, new: null })}>All</Chip>
          {facets.hasNew && <Chip active={onlyNew} onClick={() => setParams({ new: onlyNew ? null : '1' })}>New in</Chip>}
          {facets.collections.map((c) => (
            <Chip key={c} active={collection === c} onClick={() => setParams({ collection: collection === c ? null : c })}>{COLLECTIONS[c]}</Chip>
          ))}
          {facets.categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => { setParams({ category: category === c ? null : c }); if (category !== c) addFavoriteCategory(c) }}>{c}</Chip>
          ))}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          {/* Filters: a sidebar on large screens, a bottom sheet on phones. */}
          <aside className="hidden lg:col-span-3 lg:block" aria-label="Filters">{filters}</aside>

          <div className="lg:col-span-9">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setSheetOpen(true)} className="btn-secondary h-10 px-4 lg:hidden">
                <FiSliders className="h-4 w-4" /> Filters{filterCount ? ` (${filterCount})` : ''}
              </button>
              <p className="text-sm text-final-muted" aria-live="polite">{status === 'ready' ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : ''}</p>
              <label className="ml-auto flex items-center gap-2 text-sm">
                <span className="text-final-muted">Sort</span>
                <select value={sort} onChange={(e) => setParams({ sort: e.target.value === 'featured' ? null : e.target.value })}
                  className="h-10 rounded-lg border border-final-light-gray/60 bg-final-gray px-3 text-sm focus:border-final-off-white focus:outline-none">
                  {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {active.length > 0 && (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                {active.map((a) => (
                  <button key={a.label} type="button" onClick={a.clear} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-final-gray px-3 text-sm capitalize hover:bg-final-dark-gray">
                    {a.label} <FiX className="h-3.5 w-3.5" aria-label="Remove" />
                  </button>
                ))}
                <button type="button" onClick={clearAll} className="ml-1 text-sm text-final-muted underline underline-offset-4 hover:text-final-off-white">Clear all</button>
              </div>
            )}

            {status === 'loading' && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3" role="status" aria-label="Loading products">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} aria-hidden="true">
                    <div className="skeleton aspect-[4/5] rounded-xl" />
                    <div className="skeleton mt-3 h-3 w-16 rounded" />
                    <div className="skeleton mt-2 h-4 w-3/4 rounded" />
                  </div>
                ))}
              </div>
            )}

            {status === 'error' && (
              <div className="rounded-xl border border-final-off-white/10 px-6 py-16 text-center">
                <p className="text-lg font-semibold">We couldn’t load the shop.</p>
                <p className="mt-2 text-final-muted">Check your connection and try again.</p>
                <button type="button" onClick={load} className="btn-secondary mt-6"><FiRotateCw className="h-4 w-4" /> Try again</button>
              </div>
            )}

            {status === 'ready' && results.length === 0 && (
              <div className="rounded-xl border border-dashed border-final-off-white/15 px-6 py-16 text-center">
                <p className="text-lg font-semibold">{products.length ? 'Nothing matches that.' : 'The shop is empty right now.'}</p>
                <p className="mx-auto mt-2 max-w-[40ch] text-final-muted">
                  {products.length ? (q ? `No pieces match “${q}” with these filters.` : 'Try fewer filters.') : 'New pieces land in drops.'}
                </p>
                {products.length > 0 && <button type="button" onClick={clearAll} className="btn-primary mt-6">Clear search and filters</button>}
              </div>
            )}

            {status === 'ready' && results.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3" onClickCapture={rememberScroll}>
                {results.map((p) => <div key={p.id} className="cv-card"><ProductCard product={p} /></div>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="filters-title">
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-black/70" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-final-dark-gray px-5 pb-6 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="filters-title" className="text-lg font-semibold">Filters</h2>
              <button ref={closeRef} type="button" onClick={() => setSheetOpen(false)} aria-label="Close filters" className="grid h-10 w-10 place-items-center rounded-full hover:bg-final-gray">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            {filters}
            <div className="sticky bottom-0 mt-6 flex gap-3 bg-final-dark-gray pt-3">
              <button type="button" onClick={clearAll} className="btn-secondary flex-1">Clear</button>
              <button type="button" onClick={() => setSheetOpen(false)} className="btn-primary flex-1">Show {results.length}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
