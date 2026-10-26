'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { sized } from '@/lib/images'
import Link from 'next/link'
import { FiArrowRight, FiChevronDown, FiRotateCw, FiX } from 'react-icons/fi'
import { ProductCard } from '@/components/ui/ProductCard'
import { useInterestStore } from '@/lib/stores/interestStore'
import { FEED_SEED_KEY, buildProfile } from '@/lib/discovery'
import { EDITORIAL, EDITORIAL_EVERY, type EditorialTile } from '@/lib/editorial'
import type { Product } from '@/lib/catalog'

/* ── Discovery feed ──────────────────────────────────────────────
 * A masonry of real products, ranked for this shopper by /api/feed, with
 * campaign tiles mixed in. Paginated: it shows about three and a half rows,
 * fades out, and "See more" opens the next page (loading the next batch
 * when needed). Never repeats a product. Coming back from a product
 * restores the feed, how far it was opened, and the scroll position.
 * ─────────────────────────────────────────────────────────────── */

type Item = { kind: 'product'; product: Product } | { kind: 'editorial'; tile: EditorialTile }
type Status = 'loading' | 'ready' | 'error'
type Saved = { seed: number; items: Item[]; done: boolean; categories: string[]; rows: number; y: number; at: number; fetchedAt?: string }

const FIRST_BATCH = 14
const NEXT_BATCH = 8
/** Rows shown before the first "See more", and rows each "See more" adds. */
const FIRST_ROWS = 3.5
const MORE_ROWS = 3
const GAP_Y = 32 // gap-8 between items in a column
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

/** Column count from the grid's width. */
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

/** The content's height, and one product row's (a rendered product card plus the gap). */
function useMeasure(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ height: 0, rowHeight: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const card = el.querySelector('[data-feed-product]')?.getBoundingClientRect().height ?? 0
      setSize({ height: el.scrollHeight, rowHeight: card ? card + GAP_Y : 0 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

function EditorialCard({ tile }: { tile: EditorialTile }) {
  return (
    <Link href={tile.href} className="group block">
      <div className="relative overflow-hidden rounded-xl bg-final-dark-gray" style={{ aspectRatio: String(tile.ratio) }}>
        <Image src={sized(tile.src, 640)} alt={tile.alt} fill unoptimized sizes="(max-width: 600px) 50vw, (max-width: 900px) 33vw, 25vw"
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
  const picked = useInterestStore((s) => s.interests.pickedCategories)
  const togglePickedCategory = useInterestStore((s) => s.togglePickedCategory)

  const [items, setItems] = useState<Item[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [done, setDone] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [rows, setRows] = useState(FIRST_ROWS)
  const [pickerHidden, setPickerHidden] = useState(true)
  const [seed, setSeed] = useState<number | null>(null)
  // When the feed was last fetched, so a restored feed can ask what was added since.
  const [fetchedAt, setFetchedAt] = useState<string | undefined>()

  const wrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const columns = useColumns(wrapRef)
  const { height: contentHeight, rowHeight } = useMeasure(contentRef)

  // One seed per browser tab: the order stays put while you browse and come back.
  useEffect(() => {
    let s = session.get<number>(FEED_SEED_KEY)
    if (!Number.isInteger(s)) { s = Math.floor(Math.random() * 2 ** 31); session.set(FEED_SEED_KEY, s) }
    setSeed(s as number)
    try { setPickerHidden(localStorage.getItem(PICKER_KEY) === '1') } catch { setPickerHidden(false) }
  }, [])

  /** Fetches the next batch (or the first, with reset) and mixes in campaign tiles. */
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
          // Read at request time, so browsing elsewhere shapes the next batch.
          profile: buildProfile(useInterestStore.getState().interests),
        }),
      })
      if (!res.ok) throw new Error(`Feed request failed with ${res.status}`)
      const data = (await res.json()) as { products: Product[]; done: boolean; categories: string[] }

      const next = [...current]
      let count = shown.length
      let editorial = current.filter((i) => i.kind === 'editorial').length
      for (const product of data.products) {
        next.push({ kind: 'product', product })
        if (++count % EDITORIAL_EVERY === 0 && editorial < EDITORIAL.length) next.push({ kind: 'editorial', tile: EDITORIAL[editorial++] })
      }
      if (reset) setRows(FIRST_ROWS)
      setFetchedAt(new Date().toISOString())
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
    const saved = session.get<Saved>(STATE_KEY)
    if (saved && saved.seed === seed && Date.now() - saved.at < RESTORE_FOR_MS && saved.items.length) {
      setItems(saved.items)
      setDone(saved.done)
      setCategories(saved.categories)
      setRows(saved.rows ?? FIRST_ROWS)
      setFetchedAt(saved.fetchedAt)
      setStatus('ready')
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.y)))
      // Anything added to the shop since this feed was fetched goes to the top.
      if (saved.fetchedAt) {
        const ids = saved.items.flatMap((i) => (i.kind === 'product' ? [i.product.id] : []))
        fetch('/api/feed', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed, since: saved.fetchedAt, exclude: ids, limit: 8 }) })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { products?: Product[] } | null) => {
            setFetchedAt(new Date().toISOString())
            if (d?.products?.length) setItems((cur) => [...d.products!.map((product) => ({ kind: 'product' as const, product })), ...cur])
          })
          .catch(() => {})
      }
    } else {
      load(true)
    }
  }, [seed, load])

  // Remember the feed and where we are, so Back returns to the same place. Saved on every
  // change and again on the click that leaves (before the next page scrolls to the top).
  const save = useCallback(() => {
    if (seed === null || !items.length) return
    session.set(STATE_KEY, { seed, items, done, categories, rows, y: window.scrollY, at: Date.now(), fetchedAt } satisfies Saved)
  }, [seed, items, done, categories, rows, fetchedAt])
  useEffect(() => {
    save()
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [save])

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

  // The page: so many rows tall. Clipped and faded while there's more below it.
  const cap = rowHeight ? Math.round(rows * rowHeight) : undefined
  const clipped = !!cap && contentHeight > cap
  const hasMore = clipped || !done

  const seeMore = () => {
    setRows((r) => r + MORE_ROWS)
    // Fetch ahead when the loaded items won't fill the next page.
    if (!done && cap && contentHeight < cap + MORE_ROWS * rowHeight) load()
  }

  const pick = (category: string) => {
    togglePickedCategory(category)
    load(true) // the store updates synchronously, so the new picks go with this request
  }

  const hidePicker = () => {
    setPickerHidden(true)
    try { localStorage.setItem(PICKER_KEY, '1') } catch {}
  }

  const initialLoading = status === 'loading' && !items.length

  return (
    <section id="discover" className="scroll-mt-16 py-16 md:py-24" aria-labelledby="discover-heading" onClickCapture={save}>
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
              <button key={c} type="button" onClick={() => pick(c)} aria-pressed={!!picked?.includes(c)}
                className={`h-9 rounded-full border px-4 text-sm transition-colors duration-200 ${
                  picked?.includes(c) ? 'border-final-off-white bg-final-off-white text-final-black' : 'border-final-light-gray/60 text-final-off-white hover:border-final-off-white/60'
                }`}>
                {c}
              </button>
            ))}
            <button type="button" onClick={hidePicker} aria-label="Hide this" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-final-muted hover:text-final-off-white">
              <FiX className="h-4 w-4" />
            </button>
          </div>
        )}

        <div ref={wrapRef} className="relative">
          <div
            className="overflow-hidden transition-[max-height] duration-500 ease-out motion-reduce:transition-none"
            style={{ maxHeight: clipped ? cap : undefined }}
          >
            <div ref={contentRef} className="flex items-start gap-3 sm:gap-5">
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
                        <div key={keyOf(item)} data-feed-product={item.kind === 'product' || undefined} className="animate-[feedIn_400ms_ease-out_both] motion-reduce:animate-none">
                          {item.kind === 'product' ? <ProductCard product={item.product} /> : <EditorialCard tile={item.tile} />}
                        </div>
                      ))}
                    </div>
                  ))}
            </div>
          </div>
          {clipped && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-final-black/0 via-final-black/80 to-final-black" />
          )}
        </div>

        {items.length > 0 && hasMore && status !== 'error' && (
          <div className="relative z-10 -mt-4 flex justify-center">
            <button type="button" onClick={seeMore} disabled={status === 'loading'} className="btn-secondary group min-w-[11rem] disabled:opacity-60">
              {status === 'loading' ? 'Loading…' : 'See more'}
              <FiChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-10 rounded-xl border border-final-off-white/10 px-6 py-10 text-center">
            <p className="font-semibold">{items.length ? 'We couldn’t load more.' : 'We couldn’t load the feed.'}</p>
            <p className="mt-1 text-sm text-final-muted">Check your connection and try again.</p>
            <button type="button" onClick={() => load(!items.length)} className="btn-secondary mt-5">
              <FiRotateCw className="h-4 w-4" /> Try again
            </button>
          </div>
        )}

        {status === 'ready' && !hasMore && (
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
