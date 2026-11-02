import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FiCalendar, FiMapPin } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { TicketCard } from '@/components/events/TicketCard'
import { DoorTicket } from '@/components/events/Door'
import { eventWhen, validToken } from '@/lib/events'
import { loadTicket } from '@/lib/events/store'
import { doorActor, doorAs } from '@/lib/events/door'
import { getStorefront } from '@/lib/tenancy'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ticket', robots: { index: false, follow: false } }

/**
 * What a ticket's QR code opens. Door staff (a door link on this phone, or
 * Studio staff with check-in) see who it's for and can check it in, once.
 * Everyone else sees the ticket itself, so a guest can show it at the door.
 */
export default async function TicketPage({ params }: { params: { token: string } }) {
  if (!validToken(params.token)) notFound()
  const actor = await doorActor()
  if (actor) {
    const result = await doorAs(actor, params.token)
    return (
      <Layout>
        <main className="mx-auto max-w-md px-4 pb-24 pt-28">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-final-muted">Door{actor.kind === 'link' ? ` · ${actor.link.label}` : ''}</p>
          <DoorTicket token={params.token} initial={result} />
        </main>
      </Layout>
    )
  }

  const found = await loadTicket(params.token)
  if (!found) notFound()
  const { ticket, order } = found
  const { timeZone } = await getStorefront()
  const site = process.env.SITE_URL || 'https://www.finalheaven.shop'
  return (
    <Layout>
      <main className="mx-auto max-w-md px-4 pb-24 pt-28">
        <h1 className="display text-3xl">{order.event.title}</h1>
        <ul className="mt-3 space-y-2 text-sm text-final-off-white/90">
          <li className="flex items-start gap-3"><FiCalendar className="mt-0.5 h-4 w-4 shrink-0 text-final-muted" aria-hidden />{eventWhen(order.event.starts_at, timeZone)}</li>
          {(order.event.venue || order.event.address) && (
            <li className="flex items-start gap-3"><FiMapPin className="mt-0.5 h-4 w-4 shrink-0 text-final-muted" aria-hidden />{[order.event.venue, order.event.address].filter(Boolean).join(', ')}</li>
          )}
        </ul>
        <div className="mt-6"><TicketCard ticket={order.status === 'cancelled' ? { ...ticket, status: 'void' } : ticket} site={site} timeZone={timeZone} /></div>
      </main>
    </Layout>
  )
}
