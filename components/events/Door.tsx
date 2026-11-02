'use client'

import { useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiSlash, FiUser } from 'react-icons/fi'
import { showCode } from '@/lib/events'
import type { DoorResult } from '@/lib/events/store'

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' })

/** Looks a ticket up (or checks it in) through /api/door/check-in, as this phone's door actor. */
export async function doorCall(ref: string, event: string | null, checkIn: boolean): Promise<DoorResult> {
  const res = await fetch('/api/door/check-in', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, event, checkIn }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.')
  return data as DoorResult
}

/** What the door sees for a ticket, big enough to read at arm's length, with the one action it allows. */
export function DoorResultView({ result, onCheckIn, busy }: { result: DoorResult; onCheckIn?: () => void; busy?: boolean }) {
  const t = result.ticket
  const tone = {
    valid: 'border-final-off-white/30',
    checked_in: 'border-emerald-400 bg-emerald-400/10',
    already: 'border-amber-400 bg-amber-400/10',
    void: 'border-red-400 bg-red-400/10',
    not_found: 'border-red-400 bg-red-400/10',
    door_closed: 'border-red-400 bg-red-400/10',
  }[result.outcome]
  const heading = {
    valid: 'Valid ticket',
    checked_in: 'Checked in. Let them in.',
    already: t?.checkedInAt ? `Already used at ${time(t.checkedInAt)}` : 'Already used',
    void: 'Cancelled ticket. Don’t let in.',
    not_found: 'No ticket for this event',
    door_closed: 'This door link has stopped working',
  }[result.outcome]
  const Icon = result.outcome === 'checked_in' ? FiCheckCircle : result.outcome === 'valid' ? FiUser : result.outcome === 'already' ? FiAlertTriangle : FiSlash

  return (
    <div className={`rounded-2xl border-2 p-5 ${tone}`} role="status" aria-live="assertive">
      <p className="flex items-center gap-3 text-xl font-semibold"><Icon className="h-6 w-6 shrink-0" aria-hidden />{heading}</p>
      {t && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-final-muted">Name</dt><dd className="mt-0.5 text-base font-medium">{t.name}</dd></div>
          <div><dt className="text-final-muted">Ticket</dt><dd className="mt-0.5 text-base font-medium">{t.type}</dd></div>
          <div><dt className="text-final-muted">Code</dt><dd className="mt-0.5 font-mono">{showCode(t.code)}</dd></div>
          <div><dt className="text-final-muted">Event</dt><dd className="mt-0.5">{t.event}</dd></div>
        </dl>
      )}
      {result.outcome === 'valid' && onCheckIn && (
        <button type="button" onClick={onCheckIn} disabled={busy} className="btn-primary mt-5 w-full py-4 text-lg disabled:opacity-50">
          {busy ? 'Checking in…' : 'Check in'}
        </button>
      )}
    </div>
  )
}

/** A scanned ticket on /t/<token>, seen by door staff. */
export function DoorTicket({ token, initial }: { token: string; initial: DoorResult }) {
  const [result, setResult] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const checkIn = async () => {
    setBusy(true)
    setError('')
    try { setResult(await doorCall(token, null, true)) } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  return (
    <div>
      <DoorResultView result={result} onCheckIn={checkIn} busy={busy} />
      {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
    </div>
  )
}

/** The door page: type a code when a QR code won't scan. `event` is fixed for door links; staff pick one. */
export function DoorConsole({ event }: { event: string | null }) {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<DoorResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (checkIn: boolean) => {
    setBusy(true)
    setError('')
    try {
      const r = await doorCall(code, event, checkIn)
      setResult(r)
      if (checkIn && r.outcome === 'checked_in') setCode('')
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); run(false) }} className="flex gap-2">
        <label className="sr-only" htmlFor="door-code">Ticket code</label>
        <input id="door-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K7M 42Q" autoComplete="off" autoCapitalize="characters"
          inputMode="text" maxLength={12} className="min-w-0 flex-1 rounded-xl border border-final-off-white/20 bg-final-black px-4 py-3 font-mono text-xl tracking-[0.2em] focus:border-final-off-white/50 focus:outline-none" />
        <button type="submit" disabled={busy || code.replace(/\W/g, '').length < 6} className="btn-secondary px-5 disabled:opacity-40">Look up</button>
      </form>
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      {result && <DoorResultView result={result} onCheckIn={() => run(true)} busy={busy} />}
    </div>
  )
}
