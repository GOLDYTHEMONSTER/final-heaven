import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FiCalendar, FiMapPin } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { TicketPicker } from '@/components/events/TicketPicker'
import { LAUNCH_BACKDROP, LAUNCH_SCENES } from '@/components/events/scenes'
import { PerspectiveTunnelHero } from '@/components/ui/PerspectiveTunnelHero'
import { DEFAULT_TICKET_TERMS, closedMessage, eventWhen, priceLabel, salesState } from '@/lib/events'
import { loadPublicEvent } from '@/lib/events/store'
import { fromMinor, toMinor } from '@/lib/money'

// Seats change by the minute: always rendered fresh.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const ev = await loadPublicEvent(params.slug).catch(() => null)
  if (!ev) return { title: 'Event not found' }
  const description = ev.event.description.slice(0, 160) || `${eventWhen(ev.event.starts_at, ev.store.timeZone)}${ev.event.venue ? ` · ${ev.event.venue}` : ''}`
  return {
    title: ev.event.title,
    description,
    alternates: { canonical: `/events/${ev.event.slug}` },
    openGraph: { title: ev.event.title, description, images: ev.event.image_url ? [ev.event.image_url] : undefined },
  }
}

export default async function EventPage({ params }: { params: { slug: string } }) {
  const ev = await loadPublicEvent(params.slug)
  if (!ev) notFound()
  const { event, tiers, free, store } = ev
  const sales = salesState(event, new Date(), ev.storePaused)
  const site = process.env.SITE_URL || 'https://www.finalheaven.shop'
  const prices = tiers.map((t) => toMinor(t.price, event.currency))
  const soldOut = tiers.length > 0 && tiers.every((t) => (free[t.id] ?? 0) === 0)
  const when = eventWhen(event.starts_at, store.timeZone)
  const until = event.ends_at ? new Date(event.ends_at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: store.timeZone }) : null
  const from = prices.length ? priceLabel(fromMinor(Math.min(...prices), event.currency), event.currency) : null
  const status = event.status === 'cancelled' ? 'This event has been cancelled.'
    : soldOut ? 'Sold out.'
    : sales.open ? (from ? `Tickets on sale now, from ${from}.` : 'Tickets on sale now.')
    : closedMessage(sales) ?? ''

  // schema.org Event, so search engines can show the date, place and price.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.starts_at,
    ...(event.ends_at ? { endDate: event.ends_at } : {}),
    eventStatus: event.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(event.description ? { description: event.description.slice(0, 500) } : {}),
    image: [event.image_url ?? `${site}${LAUNCH_BACKDROP}`],
    ...(event.venue || event.address ? { location: { '@type': 'Place', name: event.venue || event.address, address: event.address || event.venue } } : {}),
    organizer: { '@type': 'Organization', name: 'Final Heaven', url: site },
    ...(prices.length ? {
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: event.currency,
        lowPrice: fromMinor(Math.min(...prices), event.currency),
        highPrice: fromMinor(Math.max(...prices), event.currency),
        availability: soldOut ? 'https://schema.org/SoldOut' : sales.open ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
        url: `${site}/events/${event.slug}`,
      },
    } : {}),
  }

  return (
    <Layout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <PerspectiveTunnelHero
        images={LAUNCH_SCENES}
        backdrop={event.image_url ?? LAUNCH_BACKDROP}
        eyebrow={[when, event.venue].filter(Boolean).join(' · ')}
        title={event.title}
        subtitle={status}
      >
        {sales.open && !soldOut && <a href="#tickets" className="btn-primary px-8">Get tickets</a>}
      </PerspectiveTunnelHero>

      <section id="tickets" aria-labelledby="tickets-heading" className="relative scroll-mt-20 border-t border-final-off-white/10 bg-final-black px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-center font-mono text-xs uppercase tracking-[0.3em] text-final-ember">{event.status === 'cancelled' ? 'Cancelled' : 'Access'}</p>
          <h2 id="tickets-heading" className="display mt-2 text-center text-4xl uppercase md:text-6xl">Tickets</h2>
          <div className="mt-12">
            {sales.open && tiers.length > 0 ? (
              <TicketPicker
                slug={event.slug}
                maxPerOrder={event.max_per_order}
                tiers={tiers.map((t) => ({ id: t.id, name: t.name, description: t.description, price: fromMinor(toMinor(t.price, event.currency), event.currency), free: free[t.id] ?? 0 }))}
                terms={event.terms || DEFAULT_TICKET_TERMS}
              />
            ) : (
              <p className="text-center text-final-muted">
                {closedMessage(sales) ?? 'Tickets aren’t on sale yet.'}
                {!sales.open && sales.reason === 'not_yet' && sales.opensAt ? ` They go on sale ${eventWhen(sales.opensAt, store.timeZone)}.` : ''}
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="about-heading" className="border-t border-final-off-white/10 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1fr_320px]">
          <div>
            <h2 id="about-heading" className="font-mono text-xs uppercase tracking-[0.3em] text-final-muted">The night</h2>
            {event.description
              ? <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-final-off-white/85">{event.description}</p>
              : <p className="mt-4 text-lg text-final-off-white/85">{event.title}</p>}
          </div>
          <ul className="space-y-4 text-final-off-white/90">
            <li className="flex items-start gap-3"><FiCalendar className="mt-1 h-4 w-4 shrink-0 text-final-ember" aria-hidden />
              <span>{when}{until ? ` until ${until}` : ''}</span>
            </li>
            {(event.venue || event.address) && (
              <li className="flex items-start gap-3"><FiMapPin className="mt-1 h-4 w-4 shrink-0 text-final-ember" aria-hidden />
                <span>{event.venue}{event.venue && event.address ? <br /> : null}<span className="text-final-muted">{event.address}</span></span>
              </li>
            )}
          </ul>
        </div>
      </section>
    </Layout>
  )
}
