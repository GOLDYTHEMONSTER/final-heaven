import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FiCalendar, FiMapPin } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { TicketCard } from '@/components/events/TicketCard'
import { eventWhen } from '@/lib/events'
import { loadTicketOrder } from '@/lib/events/store'
import { getStorefront } from '@/lib/tenancy'

export const dynamic = 'force-dynamic'
// Private: whoever has this link has the tickets.
export const metadata: Metadata = { title: 'Your tickets', robots: { index: false, follow: false } }

/** All of an order's tickets: the link in the ticket email. */
export default async function TicketsPage({ params }: { params: { token: string } }) {
  const order = await loadTicketOrder(params.token)
  if (!order) notFound()
  const { timeZone } = await getStorefront()
  const site = process.env.SITE_URL || 'https://www.finalheaven.shop'
  const { event, tickets } = order

  return (
    <Layout>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-28 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-final-ember">Your tickets · {order.orderNumber}</p>
        <h1 className="display mt-2 text-3xl md:text-4xl">{event.title}</h1>
        <ul className="mt-4 space-y-2 text-sm text-final-off-white/90">
          <li className="flex items-start gap-3"><FiCalendar className="mt-0.5 h-4 w-4 shrink-0 text-final-muted" aria-hidden />{eventWhen(event.starts_at, timeZone)}</li>
          {(event.venue || event.address) && (
            <li className="flex items-start gap-3"><FiMapPin className="mt-0.5 h-4 w-4 shrink-0 text-final-muted" aria-hidden />{[event.venue, event.address].filter(Boolean).join(', ')}</li>
          )}
        </ul>
        {event.status === 'cancelled' && (
          <p role="alert" className="mt-6 rounded-xl border border-final-ember/40 p-4 text-sm text-final-ember">This event has been cancelled. We’ll refund you in full; contact us if you haven’t heard from us.</p>
        )}
        {order.status === 'cancelled' && event.status !== 'cancelled' && (
          <p role="alert" className="mt-6 rounded-xl border border-final-ember/40 p-4 text-sm text-final-ember">This order was cancelled, so its tickets won’t open the door.</p>
        )}
        <p className="mt-6 text-sm text-final-muted">
          Each QR code lets one person in, once. Give each guest their own: open a ticket and send its link, or take a screenshot. Don’t post them online.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {tickets.map((t, i) => (
            <Link key={t.token} href={`/t/${t.token}`} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-final-ember">
              <TicketCard ticket={t} site={site} timeZone={timeZone} index={i + 1} of={tickets.length} />
            </Link>
          ))}
        </div>
        <p className="mt-8 text-xs text-final-muted">Bought by {order.name}. Questions? <Link href="/contact" className="underline">Contact us</Link> with your order number.</p>
      </main>
    </Layout>
  )
}
