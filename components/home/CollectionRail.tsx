import Link from 'next/link'
import Image from 'next/image'
import { FiArrowRight } from 'react-icons/fi'
import { sized } from '@/lib/images'
import type { Product } from '@/lib/catalog'
import type { Collection } from '@/lib/storefront'

/** A collection's cover: its own image, or the first four of its products as a 2×2 grid. */
export function CollectionCover({ collection, products, sizes }: { collection: Collection; products: Product[]; sizes: string }) {
  if (collection.coverImage) {
    return <Image src={sized(collection.coverImage, 640)} alt="" fill unoptimized sizes={sizes} className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
  }
  const tiles = products.map((p) => p.images?.[0]?.url).filter((u): u is string => !!u).slice(0, 4)
  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-final-black">
      {tiles.map((src, i) => (
        <div key={i} className="relative overflow-hidden bg-final-dark-gray">
          <Image src={sized(src, 640)} alt="" fill unoptimized sizes="25vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
        </div>
      ))}
    </div>
  )
}

/**
 * "Shop by mood": the store's live collections that have something in them,
 * as a swipeable row on phones and a grid on wider screens.
 */
export function CollectionRail({ items }: { items: { collection: Collection; products: Product[] }[] }) {
  const shown = items.filter((i) => i.products.length > 0).slice(0, 8)
  if (!shown.length) return null
  return (
    <section aria-labelledby="moods-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-final-muted">Collections</p>
          <h2 id="moods-heading" className="display mt-2 text-3xl md:text-4xl">Shop by mood</h2>
        </div>
        <Link href="/collections" className="group flex shrink-0 items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.08em]">
          All collections <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Five fit one row on wide screens; otherwise rows of four. */}
      <ul className={`-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 ${shown.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {shown.map(({ collection, products }) => (
          <li key={collection.id} className="w-[72vw] shrink-0 snap-start sm:w-auto">
            <Link href={`/collections/${collection.slug}`} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-final-dark-gray">
                <CollectionCover collection={collection} products={products} sizes="(max-width: 640px) 72vw, (max-width: 1024px) 50vw, 25vw" />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <h3 className="text-base font-semibold">{collection.title}</h3>
                <span className="shrink-0 text-xs text-final-muted">{products.length} {products.length === 1 ? 'piece' : 'pieces'}</span>
              </div>
              {collection.description && <p className="mt-1 line-clamp-2 text-sm text-final-muted">{collection.description}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
