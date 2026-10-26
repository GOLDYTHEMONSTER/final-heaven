import Link from 'next/link'
import { FiArrowRight } from 'react-icons/fi'
import { ProductCard } from '@/components/ui/ProductCard'
import type { Product } from '@/lib/catalog'

/** A titled row of products with a link to see them all; nothing when there are no products. */
export function ProductRail({ id, kicker, title, description, href, linkLabel, products }: {
  id: string; kicker: string; title: string; description?: string; href: string; linkLabel: string; products: Product[]
}) {
  if (!products.length) return null
  return (
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-final-muted">{kicker}</p>
          <h2 id={id} className="display mt-2 text-3xl md:text-4xl">{title}</h2>
          {description && <p className="mt-2 max-w-[52ch] text-sm text-final-muted">{description}</p>}
        </div>
        <Link href={href} className="group flex shrink-0 items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.08em]">
          {linkLabel} <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
      <ul className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.id} className="w-[62vw] shrink-0 snap-start sm:w-auto">
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  )
}
