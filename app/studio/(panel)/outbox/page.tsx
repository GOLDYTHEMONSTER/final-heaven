'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, btn, date, drainApproved } from './api'

// Studio → Outbox: marketing emails wait here until you approve them. Receipts,
// shipping notices and alerts you asked for are sent on their own. Approved
// batches go out within the day's budget (60 marketing emails a day).

type Batch = {
  id: string; code: string; label: string; trigger: string; list: string | null; reason: string; subject: string
  status: 'held' | 'approved' | 'sending' | 'sent' | 'skipped'; approved_at: string | null; created_at: string
  total: number; queued: number; sent: number
}
type Overview = { batches: Batch[]; usageLine: string; upgradeSign: boolean; email: { ready: boolean } }

export default function OutboxPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)

  const load = useCallback(async () => setData(await api<Overview>('/api/admin/outbox')), [])
  useEffect(() => { load().catch((e) => setError((e as Error).message)) }, [load])

  const waiting = (data?.batches ?? []).filter((b) => b.status === 'held')
  const going = (data?.batches ?? []).filter((b) => b.status === 'approved' || b.status === 'sending')
  const past = (data?.batches ?? []).filter((b) => b.status === 'sent' || b.status === 'skipped')
  const queued = going.reduce((n, b) => n + b.queued, 0)

  async function carryOn() {
    if (sending.current) return
    sending.current = true
    setBusy(true); setError(''); setNote('')
    try {
      const r = await drainApproved()
      setNote(`Sent ${r.sent}.${r.remaining ? ` ${r.remaining} still waiting.` : ''}`)
      if (r.paused) setError(r.paused)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="display text-3xl md:text-4xl">Outbox</h1>
        <p className="mt-1 max-w-[60ch] text-sm text-final-muted">
          Marketing emails wait here for your OK. Receipts, shipping notices and alerts people asked for are sent on their own.
        </p>
        {data && (
          <p className="mt-3 text-sm" aria-label="Email budget">
            <span className="font-semibold">{data.usageLine}</span>
            <span className="text-final-muted"> · marketing is capped at 60 a day</span>
          </p>
        )}
        {data?.upgradeSign && <p className="mt-1 text-xs text-final-muted">Over 2,000 emails this month. Two months like this is the sign to move to a paid Resend plan.</p>}
      </div>

      {data && !data.email.ready && (
        <div role="status" className="mb-6 rounded-lg border border-yellow-400/40 bg-yellow-400/10 p-4 text-sm text-final-off-white">
          Sending isn’t set up yet. You can review batches now; to send, add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> in Vercel.
        </div>
      )}
      <p role="alert" className="min-h-[1.25rem] text-sm text-final-ember">{error}</p>
      {note && <p role="status" className="mb-3 text-sm text-green-400">{note}</p>}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-final-muted">Waiting for you</h2>
      {data && waiting.length === 0 && <p className="mb-8 rounded-lg border border-final-off-white/10 p-4 text-sm text-final-muted">Nothing is waiting. New batches appear here when someone qualifies.</p>}
      <ul className="mb-10 space-y-2">
        {waiting.map((b) => <BatchRow key={b.id} b={b} cta="Review" />)}
      </ul>

      {going.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-final-muted">Approved, going out</h2>
            {queued > 0 && (
              <button type="button" onClick={carryOn} disabled={busy || !data?.email.ready} className={`${btn} border border-final-off-white/20 hover:border-final-off-white/50`}>
                {busy ? 'Sending…' : `Send now (${queued} waiting)`}
              </button>
            )}
          </div>
          <ul className="mb-10 space-y-2">
            {going.map((b) => <BatchRow key={b.id} b={b} cta="Open" />)}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-final-muted">Recent</h2>
          <ul className="space-y-2">
            {past.map((b) => <BatchRow key={b.id} b={b} cta="Open" />)}
          </ul>
        </>
      )}
    </div>
  )
}

function BatchRow({ b, cta }: { b: Batch; cta: string }) {
  const state = b.status === 'held' ? `${b.total} ${b.total === 1 ? 'person' : 'people'}`
    : b.status === 'approved' || b.status === 'sending' ? `Sending · ${b.sent}/${b.total}`
    : b.status === 'sent' ? `Sent ${b.sent}/${b.total}` : 'Skipped'
  return (
    <li>
      <Link href={`/studio/outbox/${b.id}`} className="flex items-center justify-between gap-4 rounded-lg border border-final-off-white/10 px-4 py-3 transition-colors hover:border-final-off-white/30">
        <span className="min-w-0">
          <span className="block truncate font-medium">{b.subject || 'Untitled'}</span>
          <span className="block truncate text-xs text-final-muted">{b.code} · {b.label} · {b.reason}</span>
        </span>
        <span className="shrink-0 text-right text-xs text-final-muted">
          <span className="block">{state}</span>
          <span className="block">{date(b.status === 'held' ? b.created_at : (b.approved_at ?? b.created_at))}</span>
          <span className="block font-semibold text-final-off-white">{cta}</span>
        </span>
      </Link>
    </li>
  )
}
