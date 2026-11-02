import type { Metadata } from 'next'
import { Layout } from '@/components/layout/Layout'
import { DoorConsole } from '@/components/events/Door'
import { eventWhen } from '@/lib/events'
import { doorActor } from '@/lib/events/door'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { getStorefront } from '@/lib/tenancy'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Door', robots: { index: false, follow: false } }

/** Checked in / sold for an event (sold = tickets that still open the door or already did). */
async function counts(db: ReturnType<typeof createSupabaseServiceClient>, eventId: string) {
  const [sold, inside] = await Promise.all([
    db.from('tickets').select('id', { head: true, count: 'exact' }).eq('event_id', eventId).neq('status', 'void'),
    db.from('tickets').select('id', { head: true, count: 'exact' }).eq('event_id', eventId).eq('status', 'checked_in'),
  ])
  return { sold: sold.count ?? 0, inside: inside.count ?? 0 }
}

/**
 * The door. A helper gets here from a door link; Studio staff with check-in
 * pick an event. Scanning a ticket's QR code with the phone's camera opens the
 * ticket with a Check in button; this page is for typing a code instead.
 */
export default async function DoorPage({ searchParams }: { searchParams: { event?: string; closed?: string } }) {
  const actor = await doorActor()
  const { timeZone, storeId } = await getStorefront()

  if (!actor) {
    return (
      <Layout>
        <main className="mx-auto max-w-md px-4 pb-24 pt-32 text-center">
          <h1 className="display text-3xl">Door</h1>
          <p className="mt-3 text-final-muted">
            {searchParams.closed ? 'This door link has expired or was switched off.' : 'This phone isn’t set up for the door.'} Ask the organiser for a new door link.
          </p>
        </main>
      </Layout>
    )
  }

  const db = createSupabaseServiceClient()
  let eventId: string | null = actor.kind === 'link' ? actor.link.eventId : null
  let choices: { id: string; title: string; starts_at: string }[] = []
  if (actor.kind === 'staff') {
    // Staff read events through RLS, so only their own tenant's appear.
    const { data } = await actor.staff.supabase.from('events').select('id, title, starts_at')
      .eq('store_id', storeId).eq('status', 'published').gte('starts_at', new Date(Date.now() - 2 * 86_400_000).toISOString()).order('starts_at').limit(10)
    choices = data ?? []
    eventId = choices.find((c) => c.id === searchParams.event)?.id ?? (choices.length === 1 ? choices[0].id : null)
  }
  const { data: event } = eventId ? await db.from('events').select('id, title, starts_at, venue').eq('id', eventId).maybeSingle() : { data: null }
  const c = event ? await counts(db, event.id) : null

  return (
    <Layout>
      <main className="mx-auto max-w-md px-4 pb-24 pt-28">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-final-muted">Door{actor.kind === 'link' ? ` · ${actor.link.label}` : ''}</p>
        {event ? (
          <>
            <h1 className="display mt-2 text-3xl">{event.title}</h1>
            <p className="mt-1 text-sm text-final-muted">{eventWhen(event.starts_at, timeZone)}{event.venue ? ` · ${event.venue}` : ''}</p>
            {c && <p className="mt-4 text-lg"><span className="font-semibold tabular-nums">{c.inside}</span> <span className="text-final-muted">of</span> <span className="tabular-nums">{c.sold}</span> <span className="text-final-muted">checked in</span></p>}
            <ol className="mt-6 space-y-2 text-sm text-final-off-white/80">
              <li>1. Open this phone’s camera and point it at the guest’s QR code. Tap the link that appears.</li>
              <li>2. Check the name, then press <strong>Check in</strong>. Each ticket works once.</li>
              <li>3. If a code won’t scan, type the 6-character code under it here.</li>
            </ol>
            <div className="mt-6"><DoorConsole event={event.id} /></div>
          </>
        ) : (
          <>
            <h1 className="display mt-2 text-3xl">Choose the event</h1>
            {choices.length ? (
              <ul className="mt-6 space-y-2">
                {choices.map((e) => (
                  <li key={e.id}><a href={`/door?event=${e.id}`} className="block rounded-xl border border-final-off-white/15 px-4 py-3 hover:border-final-off-white/40">
                    <span className="font-medium">{e.title}</span><span className="block text-sm text-final-muted">{eventWhen(e.starts_at, timeZone)}</span>
                  </a></li>
                ))}
              </ul>
            ) : <p className="mt-3 text-final-muted">No published events in the next few days.</p>}
          </>
        )}
      </main>
    </Layout>
  )
}
