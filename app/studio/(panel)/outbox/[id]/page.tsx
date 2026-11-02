'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { LIMITS } from '@/lib/email/campaign'
import { api, btn, date, drainApproved, field, label } from '../api'

// One held batch: the email exactly as it will arrive, who gets it and why, and
// what it costs in today's quota. Approve, skip, or reword it first.

type Detail = {
  batch: {
    id: string; code: string; label: string; trigger: string; reason: string; listLabel: string | null
    subject: string; preheader: string; heading: string; body: string; cta_label: string | null; cta_url: string | null
    status: 'held' | 'approved' | 'sending' | 'sent' | 'skipped'; approved_at: string | null
  }
  recipients: { total: number; queued: number; sent: number }
  sample: { email: string; why: string | null }[]
  quota: { today: number; days: number; text: string }
  problems: string[]
  html: string
}
type Copy = { subject: string; preheader: string; heading: string; body: string; ctaLabel: string; ctaUrl: string }

const toCopy = (b: Detail['batch']): Copy => ({ subject: b.subject, preheader: b.preheader, heading: b.heading, body: b.body, ctaLabel: b.cta_label ?? '', ctaUrl: b.cta_url ?? '' })

export default function OutboxBatchPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [copy, setCopy] = useState<Copy | null>(null)
  const [busy, setBusy] = useState<'' | 'approve' | 'skip' | 'save'>('')
  // Asked on the page, not with confirm(): a browser that blocks dialogs answers
  // confirm() with false at once, which made Approve look dead.
  const [asking, setAsking] = useState<'' | 'approve' | 'skip'>('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const data = await api<Detail>(`/api/admin/outbox/${id}`)
    setD(data)
    return data
  }, [id])
  useEffect(() => { load().catch((e) => setError((e as Error).message)) }, [load])

  const b = d?.batch
  const open = b?.status === 'held' || b?.status === 'approved'
  const set = (key: keyof Copy) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCopy((c) => (c ? { ...c, [key]: e.target.value } : c))

  async function approve() {
    if (!d) return
    setAsking('')
    setBusy('approve'); setError(''); setNote('')
    try {
      await api(`/api/admin/outbox/${id}`, { method: 'POST', body: JSON.stringify({ action: 'approve' }) })
      await load()
      setNote('Approved. Sending…')
      const r = await drainApproved().catch((e) => ({ sent: 0, paused: (e as Error).message, remaining: -1 }))
      setNote(`Approved. Sent ${r.sent} so far${r.remaining > 0 ? `; ${r.remaining} more go out within the daily budget` : ''}.`)
      if (r.paused) setError(r.paused)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  async function skip() {
    if (!d) return
    setAsking('')
    setBusy('skip'); setError('')
    try {
      await api(`/api/admin/outbox/${id}`, { method: 'POST', body: JSON.stringify({ action: 'skip' }) })
      router.push('/studio/outbox')
    } catch (e) {
      setError((e as Error).message)
      setBusy('')
    }
  }

  async function save() {
    if (!copy) return
    setBusy('save'); setError(''); setNote('')
    try {
      await api(`/api/admin/outbox/${id}`, { method: 'PUT', body: JSON.stringify({ ...copy, ctaLabel: copy.ctaLabel || null, ctaUrl: copy.ctaUrl || null }) })
      const wasApproved = b?.status === 'approved'
      await load()
      setCopy(null)
      setNote(wasApproved ? 'Saved. It is back on hold: approve it again to send.' : 'Saved.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  if (!d || !b) {
    return <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8"><p role="alert" className="text-sm text-final-ember">{error || 'Loading…'}</p></div>
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <Link href="/studio/outbox" className="text-sm text-final-muted hover:text-final-off-white">← Outbox</Link>
      <div className="mb-6 mt-2">
        <h1 className="display text-3xl md:text-4xl">{b.subject || 'Untitled'}</h1>
        <p className="mt-1 text-sm text-final-muted">{b.code} · {b.label}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-5">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 rounded-lg border border-final-off-white/10 bg-final-gray p-4 text-sm">
            <dt className="text-final-muted">Status</dt>
            <dd>{b.status === 'held' ? 'Waiting for you' : b.status === 'approved' || b.status === 'sending' ? `Approved${b.approved_at ? ` ${date(b.approved_at)}` : ''}, sending` : b.status === 'sent' ? 'Sent' : 'Skipped'}</dd>
            <dt className="text-final-muted">Subject</dt><dd>{b.subject}</dd>
            <dt className="text-final-muted">Preview line</dt><dd>{b.preheader || <span className="text-final-muted">none</span>}</dd>
            <dt className="text-final-muted">Who</dt>
            <dd>{d.recipients.total} {d.recipients.total === 1 ? 'person' : 'people'}{b.listLabel ? ` · ${b.listLabel}` : ''}{d.recipients.sent ? ` · ${d.recipients.sent} sent` : ''}</dd>
            <dt className="text-final-muted">Why them</dt><dd>{b.reason}</dd>
            <dt className="text-final-muted">Quota</dt><dd>{b.status === 'held' || b.status === 'approved' || b.status === 'sending' ? d.quota.text : '—'}</dd>
          </dl>

          <div>
            <span className={label}>Sample of addresses (up to 10)</span>
            <ul className="divide-y divide-final-off-white/10 rounded-lg border border-final-off-white/10 text-sm">
              {d.sample.map((s) => (
                <li key={s.email} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate">{s.email}</span>
                  <span className="shrink-0 text-xs text-final-muted">{s.why}</span>
                </li>
              ))}
              {d.sample.length === 0 && <li className="px-3 py-2 text-final-muted">Nobody.</li>}
            </ul>
            <p className="mt-2 text-xs text-final-muted">Everyone is checked again when it sends: anyone who has unsubscribed or bounced by then is skipped. Each email has a one-click unsubscribe.</p>
          </div>

          {copy && (
            <fieldset className="space-y-4 rounded-lg border border-final-off-white/10 p-4" disabled={busy === 'save'}>
              {b.status === 'approved' && <p className="text-xs text-final-ember">This batch is approved. Saving changes puts it back on hold until you approve it again.</p>}
              <div><label className={label} htmlFor="o-subject">Subject</label><input id="o-subject" className={field} maxLength={LIMITS.subject} value={copy.subject} onChange={set('subject')} /></div>
              <div><label className={label} htmlFor="o-pre">Preview line</label><input id="o-pre" className={field} maxLength={LIMITS.preheader} value={copy.preheader} onChange={set('preheader')} /></div>
              <div><label className={label} htmlFor="o-heading">Heading</label><input id="o-heading" className={field} maxLength={LIMITS.heading} value={copy.heading} onChange={set('heading')} /></div>
              <div><label className={label} htmlFor="o-body">Message <span className="normal-case tracking-normal">(a blank line starts a new paragraph)</span></label><textarea id="o-body" className={`${field} min-h-[160px]`} maxLength={LIMITS.body} value={copy.body} onChange={set('body')} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={label} htmlFor="o-cta">Button words</label><input id="o-cta" className={field} maxLength={LIMITS.ctaLabel} value={copy.ctaLabel} onChange={set('ctaLabel')} /></div>
                <div><label className={label} htmlFor="o-url">Button link</label><input id="o-url" className={field} maxLength={LIMITS.ctaUrl} value={copy.ctaUrl} onChange={set('ctaUrl')} /></div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={save} disabled={!!busy} className={`${btn} bg-final-off-white text-final-black hover:bg-final-off-white/90`}>{busy === 'save' ? 'Saving…' : 'Save copy'}</button>
                <button type="button" onClick={() => setCopy(null)} disabled={!!busy} className={`${btn} border border-final-off-white/20`}>Cancel</button>
              </div>
            </fieldset>
          )}

          <p role="alert" className="min-h-[1.25rem] text-sm text-final-ember">{error}</p>
          {note && <p role="status" className="text-sm text-green-400">{note}</p>}

          {open && !copy && asking && (
            <div role="alertdialog" aria-labelledby="ask-heading" className="rounded-lg border border-final-ember/50 bg-final-black p-4">
              <p id="ask-heading" className="text-sm">
                {asking === 'approve'
                  ? <>Send “{b.subject}” to {d.recipients.queued} {d.recipients.queued === 1 ? 'person' : 'people'}? It starts going out now. {d.quota.text}</>
                  : 'Skip this batch? Nobody in it will be emailed.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" autoFocus onClick={asking === 'approve' ? approve : skip} disabled={!!busy}
                  className={`${btn} ${asking === 'approve' ? 'bg-final-ember text-final-black hover:bg-final-ember/90' : 'bg-final-off-white text-final-black hover:bg-final-off-white/90'}`}>
                  {asking === 'approve' ? 'Yes, approve and send' : 'Yes, skip it'}
                </button>
                <button type="button" onClick={() => setAsking('')} disabled={!!busy} className={`${btn} border border-final-off-white/20 hover:border-final-off-white/50`}>Cancel</button>
              </div>
            </div>
          )}
          {open && !copy && !asking && (
            <div className="flex flex-wrap gap-3">
              {b.status === 'held' && (
                <button type="button" onClick={() => setAsking('approve')} disabled={!!busy || d.problems.length > 0 || d.recipients.queued === 0} className={`${btn} bg-final-ember text-final-black hover:bg-final-ember/90`}>
                  {busy === 'approve' ? 'Approving…' : 'Approve'}
                </button>
              )}
              <button type="button" onClick={() => setCopy(toCopy(b))} disabled={!!busy} className={`${btn} border border-final-off-white/20 hover:border-final-off-white/50`}>Edit copy</button>
              <button type="button" onClick={() => setAsking('skip')} disabled={!!busy} className={`${btn} border border-final-off-white/20 hover:border-final-off-white/50`}>{busy === 'skip' ? 'Skipping…' : 'Skip'}</button>
            </div>
          )}
          {b.status === 'held' && d.problems.length > 0 && <p className="text-xs text-final-muted">Before approving: {d.problems.join(' ')}</p>}
        </div>

        <div>
          <span className={label}>The email, as it will arrive</span>
          <iframe title="Email preview" srcDoc={d.html} sandbox="" className="h-[760px] w-full rounded-xl border border-final-off-white/10 bg-[#f2f1ee]" />
        </div>
      </div>
    </div>
  )
}
