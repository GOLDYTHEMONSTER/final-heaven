'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FiArrowRight, FiCheck } from 'react-icons/fi'
import { DropHeadline, DropReelBand } from '@/components/sections/DropReel'
import { ProductCard } from '@/components/ui/ProductCard'
import { useCart } from '@/components/providers/CartProvider'
import { formatCurrency } from '@/lib/utils/format'
import { DROP_01, DROP_01_PIECES, DROP_01_SET } from '@/lib/drop-01'
import { formatSetPick } from '@/lib/sets'
import { sized } from '@/lib/images'
import type { Product } from '@/lib/catalog'

const firstImage = (p?: Product) => p?.images?.[0]?.url ?? ''
const imageFor = (p: Product | undefined, colour: string) => p?.images?.find((i) => i.color === colour)?.url ?? firstImage(p)

/** One step of the set: a number, a title and what to do. */
function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-final-light-gray/40 pt-6">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-sm text-final-ember">0{n}</span>
        <div>
          <h3 className="text-lg font-semibold text-final-off-white">{title}</h3>
          <p className="mt-1 text-sm text-final-muted">{hint}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  )
}

/** A selectable picture card for the hoodie and cap steps. */
function Choice({ image, label, sub, selected, onSelect }: { image: string; label: string; sub?: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative overflow-hidden rounded-xl border-2 text-left transition-colors duration-200 ${
        selected ? 'border-final-off-white' : 'border-final-light-gray/40 hover:border-final-off-white/50'
      }`}
    >
      <div className="aspect-[4/5] bg-final-gray">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static product shots */}
        {image ? <img src={sized(image, 640)} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-sm font-medium text-final-off-white">{label}</span>
        {sub ? <span className="text-xs text-final-muted">{sub}</span> : null}
      </div>
      {selected ? (
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-final-off-white text-final-black">
          <FiCheck className="h-4 w-4" />
        </span>
      ) : null}
    </button>
  )
}

export function Drop01() {
  const { addItem } = useCart()
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [loaded, setLoaded] = useState(false)
  const [tees, setTees] = useState<string[]>([])
  const [hoodie, setHoodie] = useState<string | null>(null)
  const [cap, setCap] = useState<string | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((d) => setProducts(Object.fromEntries((d.products ?? []).map((p: Product) => [p.id, p]))))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Any change to the picks is a new set, so the "added" note no longer applies.
  useEffect(() => setAdded(false), [tees, hoodie, cap, size])

  // Tap a tee to add it; once three are picked, tapping another swaps out the earliest pick.
  const toggleTee = (id: string) => setTees((cur) =>
    cur.includes(id) ? cur.filter((t) => t !== id) : [...(cur.length >= DROP_01.teeCount ? cur.slice(1) : cur), id])

  const set = products[DROP_01.setId]
  const capProduct = products[DROP_01.cap.id]
  const teePicks = DROP_01.tees.filter((t) => tees.includes(t.id))
  const hoodiePick = DROP_01.hoodies.find((h) => h.id === hoodie)
  const capPick = DROP_01.cap.colours.find((c) => c.colour === cap)
  const sizes = set?.sizes?.length ? set.sizes : ['S', 'M', 'L', 'XL']

  // What the picked pieces cost on their own, from the live prices.
  const separately = useMemo(() => {
    // Until three tees are picked, price the first three.
    const teeIds = tees.length === DROP_01.teeCount ? tees : DROP_01.tees.slice(0, DROP_01.teeCount).map((t) => t.id)
    const ids = [...teeIds, hoodie ?? DROP_01.hoodies[0].id]
    const total = ids.reduce((sum, id) => sum + (products[id]?.price ?? 0), 0) + (capProduct?.price ?? 0)
    return total
  }, [products, tees, hoodie, capProduct])

  const purchase = set?.purchase
  const buyable = purchase?.state === 'available' || purchase?.state === 'preorder'
  const teesLeft = DROP_01.teeCount - teePicks.length
  const missing = teesLeft > 0 ? `Pick ${teesLeft} more ${teesLeft === 1 ? 'tee' : 'tees'}` : !hoodiePick ? 'Pick a hoodie' : !capPick ? 'Pick a cap' : !size ? 'Pick your size' : null

  const addSet = () => {
    if (!set || teesLeft > 0 || !hoodiePick || !capPick || !size || !buyable) return
    addItem({
      id: set.id,
      name: set.name,
      price: set.price,
      image: firstImage(set),
      size,
      color: formatSetPick(DROP_01_SET, { Tees: teePicks.map((t) => t.pick), Hoodie: [hoodiePick.pick], Cap: [capPick.pick] }),
      quantity: 1,
    })
    setAdded(true)
  }

  const pieces = DROP_01_PIECES.map((id) => products[id]).filter(Boolean)

  return (
    <main className="bg-final-black pt-16">
      {/* 1. What the drop is, in one line. */}
      <section className="py-12 sm:py-16">
        <div className="px-4 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-final-ember">Drop 01 · Live now</p>
          <DropHeadline as="h1" />
        </div>
        <div className="my-6 sm:my-8">
          <DropReelBand />
        </div>
        <div className="flex flex-col items-center gap-4 px-4 text-center">
          <p className="max-w-md text-sm text-final-muted">₦80,000 for the full set, or buy each piece on its own.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a href="#set" className="btn-primary">Build your set</a>
            <a href="#pieces" className="btn-secondary">Shop single pieces</a>
          </div>
        </div>
      </section>

      {/* 2. The full set, one step at a time. */}
      <section id="set" aria-labelledby="set-title" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-final-muted">The full set</p>
          <h2 id="set-title" className="display mt-3 text-5xl md:text-6xl">₦80,000</h2>
          <p className="mt-4 text-final-muted">Any three tees, one hoodie and one cap: you choose. Four steps.</p>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-12">
          <div className="space-y-10 lg:col-span-8">
            <Step n={1} title={`Pick your three tees · ${teePicks.length} of ${DROP_01.teeCount}`} hint="Any three of the eight. The Gothic Angel Tee comes in black.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {DROP_01.tees.map((t) => (
                  <Choice key={t.id} image={firstImage(products[t.id])} label={t.pick}
                    selected={tees.includes(t.id)} onSelect={() => toggleTee(t.id)} />
                ))}
              </div>
            </Step>

            <Step n={2} title="Pick your hoodie" hint="Choose one. The Gothic Angel Hoodie comes in black.">
              <div className="grid grid-cols-3 gap-3">
                {DROP_01.hoodies.map((h) => (
                  <Choice key={h.id} image={firstImage(products[h.id])} label={h.pick}
                    selected={hoodie === h.id} onSelect={() => setHoodie(h.id)} />
                ))}
              </div>
            </Step>

            <Step n={3} title="Pick your cap" hint="Choose one colour. One size fits all.">
              <div className="grid grid-cols-3 gap-3">
                {DROP_01.cap.colours.map((c) => (
                  <Choice key={c.colour} image={imageFor(capProduct, c.colour)} label={c.pick}
                    selected={cap === c.colour} onSelect={() => setCap(c.colour)} />
                ))}
              </div>
            </Step>

            <Step n={4} title="Your size" hint="One size for the tees and the hoodie. Relaxed, oversized fit.">
              <div className="flex flex-wrap gap-3">
                {sizes.map((s) => (
                  <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s}
                    className={`h-12 min-w-[3.5rem] rounded-lg border-2 px-4 font-semibold transition-colors duration-200 ${
                      size === s ? 'border-final-off-white bg-final-off-white text-final-black' : 'border-final-light-gray/40 text-final-off-white hover:border-final-off-white/50'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </Step>
          </div>

          {/* Summary: what's in the bag, what it costs, one button. */}
          <aside className="lg:col-span-4">
            <div className="rounded-2xl border border-final-light-gray/40 bg-final-dark-gray p-6 lg:sticky lg:top-24">
              <h3 className="text-sm font-medium uppercase tracking-[0.2em] text-final-muted">Your set</h3>
              <ul className="mt-5 space-y-3 text-sm">
                <li className="flex justify-between gap-4"><span className="text-final-muted">Tees</span><span className="text-right text-final-off-white">{teePicks.length ? teePicks.map((t) => t.pick).join(', ') : '—'}</span></li>
                <li className="flex justify-between gap-4"><span className="text-final-muted">Hoodie</span><span className="text-final-off-white">{hoodiePick?.pick ?? '—'}</span></li>
                <li className="flex justify-between gap-4"><span className="text-final-muted">Cap</span><span className="text-final-off-white">{capPick?.pick ?? '—'}</span></li>
                <li className="flex justify-between gap-4"><span className="text-final-muted">Size</span><span className="text-final-off-white">{size ?? '—'}</span></li>
              </ul>
              <div className="mt-6 border-t border-final-light-gray/40 pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-final-muted">Full set</span>
                  <span className="text-3xl font-bold text-final-off-white">{formatCurrency(set?.price ?? 80000)}</span>
                </div>
                {separately > (set?.price ?? 80000) ? (
                  <p className="mt-2 text-right text-sm text-final-muted">
                    {formatCurrency(separately)} bought separately · <span className="text-final-ember">save {formatCurrency(separately - (set?.price ?? 80000))}</span>
                  </p>
                ) : null}
              </div>

              <button type="button" onClick={addSet} disabled={!!missing || !buyable}
                className="btn-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50">
                {!loaded ? 'Loading…' : !set ? 'Coming soon' : !buyable ? (purchase?.state === 'sold_out' ? 'Sold out' : 'Unavailable') : missing ?? 'Add the full set to cart'}
              </button>
              {added ? (
                <p className="mt-3 text-center text-sm text-final-off-white">
                  Added to your cart. <Link href="/cart" className="underline underline-offset-4">View cart</Link>
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </section>

      {/* 3. Or one piece at a time. */}
      <section id="pieces" aria-labelledby="pieces-title" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-24 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-6 border-t border-final-light-gray/40 pt-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-final-muted">Single pieces</p>
            <h2 id="pieces-title" className="display mt-3 text-4xl md:text-5xl">Or buy one</h2>
          </div>
          <Link href="/shop" className="hidden items-center gap-2 text-sm text-final-muted hover:text-final-off-white sm:flex">
            Whole shop <FiArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {pieces.map((p) => <ProductCard key={p.id} product={p} viewMode="grid" />)}
        </div>
        {loaded && !pieces.length ? <p className="mt-10 text-final-muted">The pieces will be listed here shortly.</p> : null}
      </section>
    </main>
  )
}
