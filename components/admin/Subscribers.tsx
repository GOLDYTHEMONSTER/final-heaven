'use client'

import { useEffect, useState } from 'react'
import { useLiveReload } from '@/components/admin/activity'

// Newsletter and membership-waitlist sign-ups, on the Customers page. People
// appear here as soon as they sign up; customers appear after an order.

type Subscriber = { email: string; source: string | null; subscribed_at: string; consented_at: string | null; unsubscribed_at: string | null }

const SOURCE: Record<string, string> = { launch_waitlist: 'Launch waitlist', membership_waitlist: 'Membership waitlist', footer: 'Footer sign-up' }
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
// A cell starting with = + - @ would run as a spreadsheet formula: prefix it with an apostrophe.
const cell = (raw: string) => {
  const v = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function Subscribers() {
  const [rows, setRows] = useState<Subscriber[] | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useLiveReload('customers', () => setTick((t) => t + 1))

  useEffect(() => {
    fetch('/api/admin/subscribers', { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body?.error || 'Couldn’t load subscribers.')
        setRows(body.subscribers)
      })
      .catch((e) => setError(e.message))
  }, [tick])

  /** Subscribed (not unsubscribed) emails as a CSV, for the email tool. Built in the browser; nothing new leaves the server. */
  function download() {
    const active = (rows ?? []).filter((s) => !s.unsubscribed_at)
    const csv = ['email,source,subscribed_at', ...active.map((s) => [s.email, s.source ?? '', s.subscribed_at].map(cell).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const active = rows?.filter((s) => !s.unsubscribed_at).length ?? 0
  return (
    <section aria-labelledby="subscribers" className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="subscribers" className="text-lg font-semibold">Subscribers{rows ? ` (${active})` : ''}</h2>
        {active > 0 && <button type="button" onClick={download} className="text-sm underline underline-offset-2 hover:text-final-muted">Download CSV</button>}
      </div>
      {error && <p role="alert" className="text-sm text-final-ember">{error}</p>}
      {!rows && !error && <div className="skeleton h-14 rounded-lg" />}
      {rows && rows.length === 0 && <p className="text-sm text-final-muted">No sign-ups yet.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-final-off-white/10">
          <ul className="divide-y divide-final-off-white/10">
            {rows.map((s) => (
              <li key={s.email} className="flex flex-wrap items-baseline justify-between gap-2 bg-final-gray px-4 py-3 text-sm">
                <span className={`min-w-0 truncate font-medium ${s.unsubscribed_at ? 'text-final-muted line-through' : ''}`}>{s.email}</span>
                <span className="text-xs text-final-muted">
                  {SOURCE[s.source ?? ''] ?? s.source ?? 'Sign-up'} · {date(s.subscribed_at)}
                  {s.unsubscribed_at && ` · unsubscribed ${date(s.unsubscribed_at)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
