'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FiArrowRight, FiRotateCw, FiX } from 'react-icons/fi'
import { ProductCard } from '@/components/ui/ProductCard'
import { useInterestStore } from '@/lib/stores/interestStore'
import { buildProfile } from '@/lib/discovery'
import { EDITORIAL, EDITORIAL_EVERY, type EditorialTile } from '@/lib/editorial'
import type { Product } from '@/lib/catalog'

/* ── Discovery feed ──────────────────────────────────────────────
 * A masonry of real products, ranked for this shopper by /api/feed, with
 * campaign tiles mixed in. Loads a batch at a time as you near the end,
 * never repeats a product, and ends when the catalogue does. Coming back
 * from a product restores the loaded feed and the scroll position.
 * ─────────────────────────────────────────────────────────────── */

type Item = { kind: 'product'; product: Product } | { kind: 'editorial'; tile: EditorialTile }
type Status = 'loading' | 'ready' | 'error'

const FIRST_BATCH = 12
const NEXT_BATCH = 8
const SEED_KEY = 'fh-feed-seed'
const STATE_KEY = 'fh-feed-state'
const PICKER_KEY = 'fh-feed-picker-hidden'
const RESTORE_FOR_MS = 30 * 60_000

// Estimated heights, in column widths, for placing items in the shortest column.
// Product cards are 4:5 plus three lines of text; campaign tiles their ratio plus a caption.
const heightOf = (item: Item) => (item.kind === 'product' ? 1.25 + 0.34 : 1 / item.tile.ratio + 0.22)
const keyOf = (item: Item) => (item.kind === 'product' ? item.product.id : `e-${item.tile.key}`)

const session = {
  get<T>(key: string): T | null {
    try { const v = sessionStorage.getItem(key); return v ? (JSON.parse(v) as T) : null } catch { return null }
  },
  set(key: string, value: unknown) {
    try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {}
  },
}

function useColumns(ref: React.RefObject<HTMLElement>) {
  const [columns, setColumns] = useState(2)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      setColumns(w < 600 ? 2 : w < 900 ? 3 : 4)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return columns
}

function EditorialCard({ tile }: { tile: EditorialTile }) {
  return (
    <Link href={tile.href} className="group block">
      <div className="relative overflow-hidden rounded-xl bg-final-dark-gray" style={{ aspectRatio: String(tile.ratio) }}>
        <Image src={tile.src} alt={tile.alt} fill unoptimized sizes="(max-width: 600px) 50vw, (max-width: 900px) 33vw, 25vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02] motion-reduce:transition-none" />
      </div>
      <p className="mt-2.5 text-[11px] uppercase tracking-[0.12em] text-final-ember">{tile.kicker}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[15px] font-medium">
        {tile.title}
        <FiArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </p>
    </Link>
  )
}

function Skeleton({ ratio = 0.8 }: { ratio?: number }) {
  return (
    <div aria-hidden="true">
      <div className="skeleton rounded-xl" style={{ aspectRatio: String(ratio) }} />
      <div className="skeleton mt-3 h-3 w-16 rounded" />
      <div className="skeleton mt-2 h-4 w-3/4 rounded" />
    </div>
  )
}

export function DiscoveryFeed() {
  const { interests, togglePickedCategory } = useInterestStore()
  const picked = useMemo(() => interests.pickedCategories ?? [], [interests.pickedCategories])

  const [items, setItems] = useState<Item[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [done, setDone] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [pickerHidden, setPickerHidden] = useState(true)
  const [seed, setSeed] = useState<number | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const columns = useColumns(wrapRef)

  // The profile is read at request time, so browsing elsewhere changes the next batch.
  const interestsRef = useRef(interests)
  interestsRef.current = interests

  // One seed per browser tab: the order stays put while you scroll and come back.
  useEffect(() => {
    let s = session.get<number>(SEED_KEY)
    if (!Number.isInteger(s)) { s = Math.floor(Math.random() * 2 ** 31); session.set(SEED_KEY, s) }
    setSeed(s as number)
    try { setPickerHidden(localStorage.getItem(PICKER_KEY) === '1') } catch { setPickerHidden(false) }
  }, [])

  const load = useCallback(async (reset = false) => {
    if (seed === null || busy.current) return
    busy.current = true
    setStatus('loading')
    try {
      const current = reset ? [] : items
      const shown = current.flatMap((i) => (i.kind === 'product' ? [i.product] : []))
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed,
          limit: shown.length ? NEXT_BATCH : FIRST_BATCH,
          exclude: shown.map((p) => p.id),
          tail: shown.slice(-3).map((p) => p.category),
          profile: buildProfile(interestsRef.current),
        }),
      })
      if (!res.ok) throw new Error(`Feed request failed with ${res.status}`)
      const data = (await res.json()) as { products: Product[]; done: boolean; categories: string[] }

      // Mix in the next campaign tile after every few products.
      const next = [...current]
      let count = shown.length
      let editorial = current.filter((i) => i.kind === 'editorial').length
      for (const product of data.products) {
        next.push({ kind: 'product', product })
        count++
        if (count % EDITORIAL_EVERY === 0 && editorial < EDITORIAL.length) next.push({ kind: 'editorial', tile: EDITORIAL[editorial++] })
      }
      setItems(next)
      setDone(data.done)
      setCategories(data.categories)
      setStatus('ready')
    } catch {
      setStatus('error')
    } finally {
      busy.current = false
    }
  }, [seed, items])

  // First load: restore the feed this tab already had (coming back from a product), or start fresh.
  const started = useRef(false)
  useEffect(() => {
    if (seed === null || started.current) return
    started.current = true
    const saved = session.get<{ seed: number; items: Item[]; done: boolean; categories: string[]; y: number; at: number }>(STATE_KEY)
    if (saved && saved.seed === seed && Date.now() - saved.at < RESTORE_FOR_MS && saved.items.length) {
      setItems(saved.items)
      setDone(saved.done)
      setCategories(saved.categories)
      setStatus('ready')
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.y)))
    } else {
      load(true)
    }
  }, [seed, load])

  // Remember what's loaded and where we are, so Back returns to the same place. Saved on
  // every change and again on the click that leaves (before the new page scrolls to the top).
  const save = useCallback(() => {
    if (seed === null || !items.length) return
    session.set(STATE_KEY, { seed, items, done, categories, y: window.scrollY, at: Date.now() })
  }, [seed, items, done, categories])
  useEffect(() => {
    save()
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [save])

  // Load the next batch as the end of the feed comes near.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || done || status !== 'ready') return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) load() }, { rootMargin: '900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [done, status, load])

  // Changing "What are you into?" starts the feed again with the new picks.
  const pickedKey = picked.join('|')
  const firstPicks = useRef(pickedKey)
  useEffect(() => {
    if (firstPicks.current === pickedKey) return
    firstPicks.current = pickedKey
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the picks change
  }, [pickedKey])

  // Shortest-column placement. Earlier items keep their column as more arrive.
  const placed = useMemo(() => {
    const cols: Item[][] = Array.from({ length: columns }, () => [])
    const heights = new Array(columns).fill(0)
    for (const item of items) {
      const c = heights.indexOf(Math.min(...heights))
      cols[c].push(item)
      heights[c] += heightOf(item)
    }
    return cols
  }, [items, columns])

  const hidePicker = () => {
    setPickerHidden(true)
    try { localStorage.setItem(PICKER_KEY, '1') } catch {}
  }

  const initialLoading = status === 'loading' && !items.length

  return (
    <section className="py-16 md:py-24" aria-labelledby="discover-heading" onClickCapture={save}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 id="discover-heading" className="display text-4xl md:text-6xl">
              For <span className="heading-muted">you</span>
            </h2>
            <p className="mt-3 max-w-[52ch] text-final-muted">
              Everything in the shop, ordered by what you open. It learns in this browser, with nothing to sign up for.
            </p>
          </div>
          <Link href="/shop" className="group hidden shrink-0 items-center gap-2 text-sm font-semibold uppercase tracking-[0.06em] sm:inline-flex">
            Shop all
            <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Optional: tune the feed. Easy to dismiss, never required. */}
        {!pickerHidden && categories.length > 1 && (
          <div className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border border-final-light-gray/40 p-3 sm:p-4">
            <span className="mr-1 text-sm font-medium">What are you into?</span>
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => togglePickedCategory(c)} aria-pressed={picked.includes(c)}
                className={`h-9 rounded-full border px-4 text-sm transition-colors duration-200 ${
                  picked.includes(c) ? 'border-final-off-white bg-final-off-white text-final-black' : 'border-final-light-gray/60 text-final-off-white hover:border-final-off-white/60'
                }`}>
                {c}
              </button>
            ))}
            <button type="button" onClick={hidePicker} aria-label="Hide this" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-final-muted hover:text-final-off-white">
              <FiX className="h-4 w-4" />
            </button>
          </div>
        )}

        <div ref={wrapRef} className="flex items-start gap-3 sm:gap-5">
          {initialLoading
            ? Array.from({ length: columns }, (_, c) => (
                <div key={c} className="flex min-w-0 flex-1 flex-col gap-8" role={c === 0 ? 'status' : undefined} aria-label={c === 0 ? 'Loading the feed' : undefined}>
                  <Skeleton ratio={c % 2 ? 1 : 0.8} />
                  <Skeleton ratio={c % 2 ? 0.8 : 16 / 9} />
                </div>
              ))
            : placed.map((col, c) => (
                <div key={c} className="flex min-w-0 flex-1 flex-col gap-8">
                  {col.map((item) => (
                    <div key={keyOf(item)} className="animate-[feedIn_400ms_ease-out_both] motion-reduce:animate-none">
                      {item.kind === 'product' ? <ProductCard product={item.product} /> : <EditorialCard tile={item.tile} />}
                    </div>
                  ))}
                  {status === 'loading' && <Skeleton ratio={0.8} />}
                </div>
              ))}
        </div>

        <div ref={sentinelRef} aria-hidden="true" className="h-px" />

        {status === 'error' && (
          <div className="mt-10 rounded-xl border border-final-off-white/10 px-6 py-10 text-center">
            <p className="font-semibold">{items.length ? 'We couldn’t load more.' : 'We couldn’t load the feed.'}</p>
            <p className="mt-1 text-sm text-final-muted">Check your connection and try again.</p>
            <button type="button" onClick={() => load(!items.length)} className="btn-secondary mt-5">
              <FiRotateCw className="h-4 w-4" /> Try again
            </button>
          </div>
        )}

        {status === 'ready' && done && (
          <div className="mt-14 flex flex-col items-center gap-4 border-t border-final-light-gray/40 pt-10 text-center">
            <p className="font-semibold">{items.length ? 'You’ve seen everything in the shop right now.' : 'Nothing in the shop right now.'}</p>
            <p className="max-w-[44ch] text-sm text-final-muted">New pieces land in drops. Browse by category, or come back when the next one lands.</p>
            <Link href="/shop" className="btn-secondary">Browse the shop</Link>
          </div>
        )}
      </div>
    </section>
  )
}
