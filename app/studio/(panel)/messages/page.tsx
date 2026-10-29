'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useLiveReload } from '@/components/admin/activity'
import { TrendStrip } from '@/components/admin/Trends'

type Message = {
  id: string
  created_at: string
  name: string
  email: string
  order_number: string | null
  topic: 'order' | 'return' | 'privacy' | 'other'
  message: string
  status: 'open' | 'replied' | 'closed'
}

const TOPIC: Record<string, string> = { order: 'Order', return: 'Return / refund', privacy: 'Personal data', other: 'Other' }
const FILTERS = [{ key: 'open', label: 'Open' }, { key: 'replied', label: 'Replied' }, { key: 'closed', label: 'Closed' }, { key: '', label: 'All' }]

export default function MessagesPage() {
  const [filter, setFilter] = useState('open')
  const [messages, setMessages] = useState<Message[]>([])
  const [canUpdate, setCanUpdate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/messages${filter ? `?status=${filter}` : ''}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Could not load messages.')
      setMessages(body.messages)
      setCanUpdate(body.canUpdate)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])
  useLiveReload('messages', load)

  async function setStatus(id: string, status: Message['status']) {
    const res = await fetch('/api/admin/messages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(body?.error || 'Could not update the message.')
    load()
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-3xl md:text-4xl">Messages</h1>
          <p className="mt-1 text-sm text-final-muted">From the contact form. Reply by email, then mark it replied.</p>
        </div>
        <div role="radiogroup" aria-label="Filter messages" className="inline-flex rounded-lg border border-final-off-white/15 p-1">
          {FILTERS.map((f) => (
            <button key={f.key} role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-sm ${filter === f.key ? 'bg-final-off-white text-final-black' : 'text-final-muted hover:text-final-off-white'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <TrendStrip group="messages" title="Inbox trends" />

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}
      {loading && !messages.length && <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>}
      {!loading && !messages.length && !error && (
        <div className="rounded-xl border border-dashed border-final-off-white/15 px-6 py-16 text-center">
          <p className="font-semibold">{filter === 'open' ? 'No open messages' : 'Nothing here'}</p>
          <p className="mt-1 text-sm text-final-muted">Messages sent from the Contact page appear here.</p>
        </div>
      )}

      <ul className={`space-y-3 ${loading ? 'opacity-50' : ''}`}>
        {messages.map((m) => (
          <li key={m.id} className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{m.name} <span className="font-normal text-final-muted">· {m.email}</span></p>
              <p className="text-xs text-final-muted">{new Date(m.created_at).toLocaleString('en-GB')}</p>
            </div>
            <p className="mt-1 text-xs text-final-muted">
              <span className={m.topic === 'privacy' ? 'text-final-ember' : ''}>{TOPIC[m.topic]}</span>
              {m.order_number && <> · <Link href={`/studio/orders?q=${encodeURIComponent(m.order_number)}`} className="font-mono underline underline-offset-2">{m.order_number}</Link></>}
              {' '}· {m.status}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{m.message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: your message to Final Heaven${m.order_number ? ` (${m.order_number})` : ''}`)}`} className="btn-primary px-4 py-2">
                Reply by email
              </a>
              {canUpdate && m.status !== 'replied' && <button onClick={() => setStatus(m.id, 'replied')} className="btn-secondary px-4 py-2">Mark replied</button>}
              {canUpdate && m.status !== 'closed' && <button onClick={() => setStatus(m.id, 'closed')} className="btn-secondary px-4 py-2">Close</button>}
              {canUpdate && m.status === 'closed' && <button onClick={() => setStatus(m.id, 'open')} className="btn-secondary px-4 py-2">Reopen</button>}
            </div>
            {m.topic === 'privacy' && (
              <p className="mt-3 text-xs text-final-muted">Personal data requests must be answered within the time the Nigeria Data Protection Act allows. Confirm the person’s identity (e.g. that they own the order email) before sharing or deleting anything.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
