import Image from 'next/image'
import { sized } from '@/lib/images'
import { formatDay } from '@/lib/catalog'
import type { UpcomingDrop } from '@/lib/storefront'

/** Drops with a real release day still ahead. Nothing shows without one: no invented dates or countdowns. */
export function UpcomingDrops({ drops }: { drops: UpcomingDrop[] }) {
  if (!drops.length) return null
  return (
    <section aria-labelledby="upcoming-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="text-xs uppercase tracking-[0.24em] text-final-muted">Coming up</p>
      <h2 id="upcoming-heading" className="display mt-2 text-3xl md:text-4xl">Next drops</h2>
      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {drops.map((d) => (
          <li key={d.id} className="overflow-hidden rounded-lg border border-final-off-white/10">
            {d.previewImage && (
              <div className="relative aspect-[4/3] bg-final-dark-gray">
                <Image src={sized(d.previewImage, 640)} alt="" fill unoptimized sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
              </div>
            )}
            <div className="p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-final-ember">Drops {formatDay(d.releaseDate, { day: 'numeric', month: 'long' })}</p>
              <h3 className="mt-1 text-lg font-semibold">{d.name}</h3>
              {d.description && <p className="mt-1 line-clamp-3 text-sm text-final-muted">{d.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
