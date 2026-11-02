import type { Metadata } from 'next'
import Link from 'next/link'
import { FiArrowUpRight, FiMapPin } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { LAUNCH_SCENES } from '@/components/events/scenes'
import { eventWhen, priceLabel } from '@/lib/events'
import { listPublicEvents, type EventCard } from '@/lib/events/store'
import { fromMinor } from '@/lib/money'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Events',
  description: 'Final Heaven nights: what’s on, and tickets.',
  alternates: { canonical: '/events' },
}

/** What a card's corner says: on sale, sold out, not yet, over. */
function status(c: EventCard): { label: string; hot: boolean } {
  if (c.event.status === 'cancelled') return { label: 'Cancelled', hot: false }
  if (c.soldOut) return { label: 'Sold out', hot: false }
  if (c.sales.open) return { label: 'On sale', hot: true }
  return { label: c.sales.reason === 'not_yet' ? 'Soon' : c.sales.reason === 'paused' ? 'Paused' : 'Closed', hot: false }
}

const day = (iso: string, timeZone: string) => {
  const d = new Date(iso)
  return {
    num: d.toLocaleDateString('en-GB', { day: '2-digit', timeZone }),
    month: d.toLocaleDateString('en-GB', { month: 'short', timeZone }).toUpperCase(),
  }
}

/** /events: everything on, soonest first, then the latest past nights. */
export default async function EventsPage() {
  const { upcoming, past, timeZone } = await listPublicEvents()

  return (
    <Layout>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-final-ember">Final Heaven</p>
        <h1 className="display mt-2 text-5xl uppercase md:text-7xl">Events</h1>
        <p className="mt-3 max-w-xl text-final-muted">Nights we throw and nights we back. Tickets are sold here; each one comes with its own QR code for the door.</p>

        {upcoming.length ? (
          <ul className="mt-12 grid gap-6 md:grid-cols-2">
            {upcoming.map((c, i) => {
              const s = status(c)
              const d = day(c.event.starts_at, timeZone)
              const image = c.event.image_url ?? LAUNCH_SCENES[i % LAUNCH_SCENES.length].src
              return (
                <li key={c.event.id}>
                  <Link href={`/events/${c.event.slug}`} className="group relative block overflow-hidden rounded-[6px] border border-final-off-white/10 bg-final-gray">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element -- event art or a scene photo; the image optimiser is off (next.config.js) */}
                      <img src={image} alt="" loading={i < 2 ? 'eager' : 'lazy'} decoding="async"
                        className={`h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${c.event.status === 'cancelled' ? 'grayscale' : ''}`} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
                      <div className="absolute left-4 top-4 bg-final-black px-3 py-2 text-center font-mono leading-none">
                        <span className="block text-3xl font-black">{d.num}</span>
                        <span className="mt-1 block text-[11px] tracking-[0.25em] text-final-muted">{d.month}</span>
                      </div>
                      <span className={`absolute right-4 top-4 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em] ${s.hot ? 'bg-final-ember text-final-black' : 'bg-final-black text-final-muted'}`}>{s.label}</span>
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <h2 className="display text-4xl uppercase leading-none sm:text-5xl">{c.event.title}</h2>
                        <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-final-off-white/80">{eventWhen(c.event.starts_at, timeZone)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-5 py-4 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-final-muted">
                        <FiMapPin className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{[c.event.venue, c.event.address].filter(Boolean).join(', ') || 'Venue to be announced'}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 font-medium">
                        {c.fromMinor != null && s.label !== 'Cancelled' ? `From ${priceLabel(fromMinor(c.fromMinor, c.event.currency), c.event.currency)}` : 'Details'}
                        <FiArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="mt-12 rounded-[6px] border border-dashed border-final-off-white/15 px-6 py-16 text-center">
            <p className="font-semibold">Nothing on right now</p>
            <p className="mt-1 text-sm text-final-muted">New nights land here first. <Link href="/shop" className="underline">Browse the shop</Link> while you wait.</p>
          </div>
        )}

        {past.length > 0 && (
          <section aria-labelledby="past-heading" className="mt-20">
            <h2 id="past-heading" className="font-mono text-xs uppercase tracking-[0.3em] text-final-muted">Past nights</h2>
            <ul className="mt-4 divide-y divide-final-off-white/10 border-y border-final-off-white/10">
              {past.map((c) => (
                <li key={c.event.id}>
                  <Link href={`/events/${c.event.slug}`} className="flex flex-wrap items-baseline justify-between gap-2 py-4 text-final-muted hover:text-final-off-white">
                    <span className="display text-xl uppercase">{c.event.title}</span>
                    <span className="font-mono text-xs uppercase tracking-[0.2em]">{eventWhen(c.event.starts_at, timeZone)}{c.event.status === 'cancelled' ? ' · Cancelled' : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </Layout>
  )
}
