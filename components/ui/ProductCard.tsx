'use client'

import Link from 'next/link'
import Image from 'next/image'
import { sized } from '@/lib/images'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiCheck, FiPlus } from 'react-icons/fi'
import { formatCurrency } from '@/lib/utils/format'
import { useCart } from '@/components/providers/CartProvider'
import type { Product } from '@/lib/catalog'
import { orderedIn } from '@/lib/collections'
import { CardFrame, CardFrameMat, HypeTag, useCardFrame } from '@/components/hype/Hype'

/** What stops this product being bought now, as a short label; null when it can be bought. */
function blockedLabel(product: Product) {
  switch (product.purchase?.state) {
    case 'sold_out': return 'Sold out'
    case 'coming_soon': return 'Coming soon'
    case 'members_only': return 'Members only'
    case 'paused':
    case 'unavailable': return 'Unavailable'
    default: return null
  }
}

/** The small line above the name: the label for independent products, else the category. */
function metaLine(product: Product) {
  if (product.sourceType === 'independent' && product.brand) return product.brand.name
  return product.category
}

/** "Last one" only when exactly one is really in stock and ready to ship. */
const lastOne = (product: Product) =>
  product.fulfilment !== 'made_to_order' && product.purchase?.state === 'available' && product.purchase.maxQuantity === 1 ? 'Last one' : null

const madeToOrder = (product: Product) => product.fulfilment === 'made_to_order'

interface ProductCardProps {
  product: Product
  viewMode?: 'grid' | 'list'
}

const PLACEHOLDER = '/api/placeholder/400/500'

function Badges({ product, underFrame = false }: { product: Product; underFrame?: boolean }) {
  const preorder = product.purchase?.state === 'preorder'
  const blocked = blockedLabel(product)
  const single = lastOne(product)
  const made = madeToOrder(product) && !blocked
  if (!product.isNew && !product.isLimited && !product.membersOnly && !preorder && !blocked && !single && !made) return null
  return (
    <div className={`pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5 ${underFrame ? 'fh-cardframe-hides' : ''}`}>
      {blocked && blocked !== 'Members only' && (
        <span className="rounded-md bg-final-off-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-final-black">
          {blocked}
        </span>
      )}
      {preorder && (
        <span className="rounded-md bg-final-off-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-final-black">
          Pre-order
        </span>
      )}
      {made && (
        <span className="rounded-md bg-final-off-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-final-black">
          {orderedIn(product) ? (product.leadTimeDays ? `Ships in ~${product.leadTimeDays} days` : 'Ordered in') : 'Made to order'}
        </span>
      )}
      {single && (
        <span className="rounded-md bg-final-off-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-final-black">
          {single}
        </span>
      )}
      {product.isNew && (
        <span className="rounded-md bg-final-ember px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-final-black">
          New
        </span>
      )}
      {product.isLimited && (
        <span className="rounded-md bg-final-black/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-final-off-white backdrop-blur">
          Limited
        </span>
      )}
      {product.membersOnly && (
        <span className="rounded-md border border-final-ember/60 bg-final-black/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-final-ember backdrop-blur">
          Members
        </span>
      )}
    </div>
  )
}

function Price({ product, large = false }: { product: Product; large?: boolean }) {
  return (
    <p className={`flex items-baseline gap-2 tabular-nums ${large ? 'text-lg' : 'text-[15px]'}`}>
      <span className="font-semibold text-final-off-white">{formatCurrency(product.price)}</span>
      {product.originalPrice && (
        <span className="text-sm text-final-muted line-through">{formatCurrency(product.originalPrice)}</span>
      )}
    </p>
  )
}

export function ProductCard({ product, viewMode = 'grid' }: ProductCardProps) {
  const { addItem } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])
  // Elite, Iconic and Legendary products show their rank frame on hover (only while Hype is on).
  const frame = useCardFrame(product.id)

  const mainImage = product.images?.[0]?.url || product.image || PLACEHOLDER
  const href = `/product/${product.id}`
  // Quick add only when there's nothing to choose; otherwise the product page asks for size and colour.
  const buyable = !product.purchase || product.purchase.state === 'available' || product.purchase.state === 'preorder'
  const needsChoice = (product.sizes?.length ?? 0) > 0 || (product.colors?.length ?? 0) > 0

  const handleAddToCart = useCallback(() => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: mainImage,
      size: null,
      color: null,
      quantity: 1,
      isMembersOnly: product.membersOnly,
    })
    setJustAdded(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setJustAdded(false), 1400)
  }, [addItem, product.id, product.name, product.price, product.membersOnly, mainImage])

  // Icon morphs from plus to check, so the confirmation appears exactly where the tap happened.
  const addButton = !buyable ? null : needsChoice ? (
    <Link
      href={href}
      aria-label={`Choose options for ${product.name}`}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-final-off-white text-final-black transition-colors duration-200 hover:bg-final-accent-dark"
    >
      <FiPlus className="h-[18px] w-[18px]" strokeWidth={2.5} />
    </Link>
  ) : (
    <motion.button
      type="button"
      onClick={handleAddToCart}
      whileTap={{ scale: 0.9 }}
      aria-label={justAdded ? `${product.name} added to cart` : `Add ${product.name} to cart`}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors duration-200 ${
        justAdded ? 'bg-final-ember text-final-black' : 'bg-final-off-white text-final-black hover:bg-final-accent-dark'
      }`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={justAdded ? 'added' : 'add'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
        >
          {justAdded ? <FiCheck className="h-[18px] w-[18px]" strokeWidth={2.5} /> : <FiPlus className="h-[18px] w-[18px]" strokeWidth={2.5} />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )

  if (viewMode === 'list') {
    return (
      <article className="group relative flex gap-5 rounded-xl border border-final-off-white/10 bg-final-gray p-3 transition-colors duration-200 hover:border-final-off-white/20">
        <Link href={href} className="relative aspect-[4/5] w-32 shrink-0 overflow-hidden rounded-lg bg-final-dark-gray sm:w-40">
          <Image
            src={sized(mainImage, 640)}
            alt={product.name}
            fill
            unoptimized
            sizes="160px"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
          <Badges product={product} />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col py-1">
          <p className="text-xs uppercase tracking-[0.12em] text-final-muted">{metaLine(product)}</p>
          <h3 className="mt-1 text-lg font-semibold leading-snug">
            <Link href={href} className="after:absolute after:inset-0">
              {product.name}
            </Link>
          </h3>
          {product.description && (
            <p className="mt-2 line-clamp-2 max-w-[60ch] text-sm text-final-muted">{product.description}</p>
          )}
          {product.sizes && product.sizes.length > 0 && (
            <p className="mt-2 text-xs text-final-muted">Sizes {product.sizes.join(' / ')}</p>
          )}
          <HypeTag productId={product.id} />
          <div className="relative z-10 mt-auto flex items-center justify-between gap-4 pt-4">
            <Price product={product} large />
            {addButton}
          </div>
        </div>
      </article>
    )
  }

  // A second view (usually the front) is revealed on hover, only where there is a pointer to hover with.
  const secondImage = product.images?.[1]?.url

  return (
    <article className="group relative">
      {/* 4:5 matches the store photos, so garments aren't cropped. */}
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-final-dark-gray">
        {frame && <CardFrameMat geometry={frame.geometry} photo={sized(mainImage, 640)} />}
        <Link href={href} aria-label={product.name} className={`absolute inset-0 ${frame ? 'fh-cardframe-photo' : ''}`} style={frame?.photoStyle}>
          <Image
            src={sized(mainImage, 640)}
            alt={product.name}
            fill
            unoptimized
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
          {secondImage && (
            <Image
              src={sized(secondImage, 640)}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="hidden object-cover opacity-0 transition-opacity duration-500 ease-out motion-reduce:transition-none [@media(hover:hover)]:block [@media(hover:hover)]:group-hover:opacity-100"
            />
          )}
        </Link>
        {frame && <CardFrame rank={frame.rank} geometry={frame.geometry} />}
        <Badges product={product} underFrame={Boolean(frame)} />
        {/* Always visible on touch screens; revealed on hover or keyboard focus with a pointer. */}
        <div style={frame?.buttonStyle} className={`${frame ? 'fh-cardframe-button' : ''} absolute bottom-3 right-3 z-10 transition-[opacity,transform] duration-200 ease-out [@media(hover:hover)]:translate-y-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:translate-y-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100`}>
          {addButton}
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <p className="text-[11px] uppercase tracking-[0.12em] text-final-muted">{metaLine(product)}</p>
        <h3 className="mt-1 truncate text-[15px] font-medium">
          <Link href={href} className="transition-colors hover:text-final-muted">
            {product.name}
          </Link>
        </h3>
        <div className="mt-1.5">
          <Price product={product} />
        </div>
        <HypeTag productId={product.id} />
      </div>
    </article>
  )
}
