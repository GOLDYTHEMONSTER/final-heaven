'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils/format'
import { api, field, label } from '../outbox/api'

type Row = { id: string; slug: string; title: string; starts_at: string; venue: string; status: 'draft' | 'published' | 'cancelled'; sales_paused: boolean; sold: number; inside: number; revenue: number }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' })
const STATUS = { draft: 'Draft', published: 'On sale', cancelled: 'Cancelled' }

export default function EventsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', starts_at: '', venue: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setEvents((await api<{ events: Row[] }>('/api/admin/events')).events)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { event } = await api<{ event: { id: string } }>('/api/admin/events', { method: 'POST', body: JSON.stringify(form) })
      router.push(`/studio/events/${event.id}`)
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <h1 className="display text-3xl md:text-4xl">Events</h1>
      <p className="mt-1 text-sm text-final-muted">
        Ticketed events, sold through Flutterwave like the shop but on their own dates: tickets can go on sale before checkout opens.
        Each ticket gets a QR code, checked once at the door.
      </p>

      {error && <div role="alert" className="mt-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}

      <form onSubmit={create} className="mt-8 rounded-xl border border-final-off-white/10 bg-final-gray p-5">
        <h2 className="font-semibold">New event</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-3"><span className={label}>Title</span>
            <input required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Final Heaven Launch Night" className={field} />
          </label>
          <label><span className={label}>Starts (Lagos time)</span>
            <input required type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className={field} />
          </label>
          <label className="sm:col-span-2"><span className={label}>Venue</span>
            <input maxLength={200} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} className={field} />
          </label>
        </div>
        <p className="mt-3 text-xs text-final-muted">It starts as a draft. Add tickets, then publish it to put it on sale.</p>
        <button type="submit" disabled={saving} className="btn-primary mt-4 px-5 py-2 disabled:opacity-50">{saving ? 'Creating…' : 'Create event'}</button>
      </form>

      {loading && <div className="mt-8 space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>}
      {!loading && !events.length && !error && (
        <div className="mt-8 rounded-xl border border-dashed border-final-off-white/15 px-6 py-16 text-center">
          <p className="font-semibold">No events yet</p>
          <p className="mt-1 text-sm text-final-muted">Events you create appear here with their ticket sales.</p>
        </div>
      )}
      <ul className="mt-8 space-y-3">
        {events.map((ev) => (
          <li key={ev.id}>
            <Link href={`/studio/events/${ev.id}`} className="block rounded-xl border border-final-off-white/10 bg-final-gray p-5 hover:border-final-off-white/30">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{ev.title}
                  <span className={`ml-2 text-xs font-normal uppercase tracking-[0.12em] ${ev.status === 'published' && !ev.sales_paused ? 'text-final-ember' : 'text-final-muted'}`}>
                    {ev.status === 'published' && ev.sales_paused ? 'Paused' : STATUS[ev.status]}
                  </span>
                </p>
                <p className="text-sm tabular-nums">{formatCurrency(ev.revenue)}</p>
              </div>
              <p className="mt-1 text-sm text-final-muted">{when(ev.starts_at)}{ev.venue ? ` · ${ev.venue}` : ''} · {ev.sold} sold · {ev.inside} checked in</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
