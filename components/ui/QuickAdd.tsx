'use client'

import { ColorSwatches } from '@/components/product/ColorSwatches'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCheck, FiX } from 'react-icons/fi'
import { useCart } from '@/components/providers/CartProvider'
import { useInterestStore } from '@/lib/stores/interestStore'
import { sized } from '@/lib/images'
import { formatCurrency } from '@/lib/utils/format'
import type { Product } from '@/lib/catalog'

/**
 * The "+" on a product card for a product with sizes or colours: a small sheet
 * to choose them and add to the cart without leaving the page. The options are
 * the product's own spellings, exactly as the product page sends them (checkout
 * refuses any other).
 */
export function QuickAdd({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem } = useCart()
  const { trackCartAddition } = useInterestStore()
  const sizes = product.sizes ?? []
  const colors = product.colors ?? []
  const [size, setSize] = useState(sizes.length === 1 ? sizes[0] : '')
  const [color, setColor] = useState(colors.length === 1 ? colors[0] : '')
  const [added, setAdded] = useState(false)

  const image = (color && product.images?.find((i) => i.color === color)?.url) || product.images?.[0]?.url || product.image || ''
  const ready = (!sizes.length || size) && (!colors.length || color)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onClose])

  const add = () => {
    if (!ready) return
    trackCartAddition(product.id)
    addItem({
      id: product.id, name: product.name, price: product.price, image: image || '/api/placeholder/400/500',
      size: sizes.length ? size : null, color: colors.length ? color : null, quantity: 1, isMembersOnly: product.membersOnly || false,
    })
    setAdded(true)
  }

  const chip = (on: boolean) => `rounded-lg border px-3.5 py-2 text-sm transition-colors ${on ? 'border-final-off-white bg-final-off-white text-final-black' : 'border-final-off-white/20 text-final-off-white hover:border-final-off-white/50'}`

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Add ${product.name} to cart`} onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-final-off-white/10 bg-final-gray p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="flex gap-4">
          {image && (
            <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-lg bg-final-dark-gray">
              <Image src={sized(image, 640)} alt="" fill unoptimized sizes="80px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{product.name}</p>
            <p className="mt-1 text-sm tabular-nums text-final-muted">{formatCurrency(product.price)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-final-off-white/10"><FiX aria-hidden /></button>
        </div>

        {added ? (
          <div className="mt-5" role="status">
            <p className="flex items-center gap-2 font-medium"><FiCheck className="text-final-ember" aria-hidden /> Added to your cart</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={onClose} className="btn-secondary">Keep shopping</button>
              <Link href="/cart" className="btn-primary text-center">View cart</Link>
            </div>
          </div>
        ) : (
          <>
            {sizes.length > 0 && (
              <fieldset className="mt-5">
                <legend className="mb-2 text-xs uppercase tracking-[0.12em] text-final-muted">Size</legend>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)} className={chip(size === s)}>{s}</button>)}
                </div>
              </fieldset>
            )}
            {colors.length > 0 && (
              <fieldset className="mt-5">
                <legend className="mb-2 text-xs uppercase tracking-[0.12em] text-final-muted">Colour{color ? <span className="ml-2 normal-case tracking-normal text-final-off-white">{color}</span> : null}</legend>
                <div className="flex flex-wrap gap-2">
                  <ColorSwatches colors={colors} images={product.images} value={color} onChange={setColor} size="sm" />
                </div>
              </fieldset>
            )}
            <button type="button" onClick={add} disabled={!ready} className="btn-primary mt-6 w-full disabled:opacity-40">
              {ready ? 'Add to cart' : `Choose ${[sizes.length && !size ? 'a size' : '', colors.length && !color ? 'a colour' : ''].filter(Boolean).join(' and ')}`}
            </button>
            <Link href={`/product/${product.id}`} className="mt-3 block text-center text-sm text-final-muted underline underline-offset-4">See all details</Link>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
