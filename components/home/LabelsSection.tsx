import Link from 'next/link'
import Image from 'next/image'
import { sized } from '@/lib/images'
import type { Brand } from '@/lib/storefront'

/** Independent labels sold here. Only published labels, so only real partnerships, ever show. */
export function LabelsSection({ brands }: { brands: Brand[] }) {
  if (!brands.length) return null
  return (
    <section aria-labelledby="labels-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="text-xs uppercase tracking-[0.24em] text-final-muted">Independent labels</p>
      <h2 id="labels-heading" className="display mt-2 text-3xl md:text-4xl">Labels we stock</h2>
      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {brands.map((b) => (
          <li key={b.id}>
            <Link href={`/brands/${b.slug}`} className="group flex h-full flex-col rounded-lg border border-final-off-white/10 p-4 transition-colors hover:border-final-off-white/30">
              <div className="relative h-14 w-full">
                {b.logoUrl
                  ? <Image src={sized(b.logoUrl, 640)} alt={`${b.name} logo`} fill unoptimized sizes="200px" className="object-contain object-left" />
                  : <span className="display text-xl">{b.name}</span>}
              </div>
              {b.logoUrl && <p className="mt-3 font-semibold">{b.name}</p>}
              {b.description && <p className="mt-1 line-clamp-2 text-sm text-final-muted">{b.description}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
