'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useLiveReload } from '@/components/admin/activity'
import { TrendStrip } from '@/components/admin/Trends'
import { fillReply, type SavedReply } from '@/lib/support'

type Message = {
  id: string
  created_at: string
  name: string
  email: string
  order_number: string | null
  topic: 'order' | 'return' | 'privacy' | 'other'
  message: string
  status: 'open' | 'replied' | 'closed'
  reference: string | null
}
type Reply = { id: string; body: string; author_email: string | null; created_at: string }
type OrderRow = { order_number: string; created_at: string; status: string; total: number | string; currency: string }
type Thread = { message: Message; replies: Reply[]; orders: OrderRow[]; canSeeOrders: boolean; canReply: boolean }

const TOPIC: Record<string, string> = { order: 'Order', return: 'Return / refund', privacy: 'Personal data', other: 'Other' }
const FILTERS = [{ key: 'open', label: 'Open' }, { key: 'replied', label: 'Replied' }, { key: 'closed', label: 'Closed' }, { key: '', label: 'All' }]
const when = (iso: string) => new Date(iso).toLocaleString('en-GB')
const money = (amount: number | string, currency: string) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(Number(amount))

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: 'no-store', ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || 'Something went wrong.')
  return body
}

export default function MessagesPage() {
  const [filter, setFilter] = useState('open')
  const [messages, setMessages] = useState<Message[]>([])
  const [canUpdate, setCanUpdate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const body = await api(`/api/admin/messages${filter ? `?status=${filter}` : ''}`)
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

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-3xl md:text-4xl">Messages</h1>
          <p className="mt-1 text-sm text-final-muted">From the contact form. Open one to read the thread and reply; the customer gets your reply by email.</p>
        </div>
        <div role="radiogroup" aria-label="Filter messages" className="inline-flex rounded-lg border border-final-off-white/15 p-1">
          {FILTERS.map((f) => (
            <button key={f.key} role="radio" aria-checked={filter === f.key} onClick={() => { setFilter(f.key); setOpenId(null) }}
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
          <li key={m.id} className="rounded-xl border border-final-off-white/10 bg-final-gray">
            <button onClick={() => setOpenId(openId === m.id ? null : m.id)} aria-expanded={openId === m.id} className="block w-full p-5 text-left">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{m.name} <span className="font-normal text-final-muted">· {m.email}</span></span>
                <span className="text-xs text-final-muted">{when(m.created_at)}</span>
              </span>
              <span className="mt-1 block text-xs text-final-muted">
                {m.reference && <span className="font-mono">{m.reference} · </span>}
                <span className={m.topic === 'privacy' ? 'text-final-ember' : ''}>{TOPIC[m.topic]}</span>
                {m.order_number && <> · <span className="font-mono">{m.order_number}</span></>}
                {' '}· {m.status}
              </span>
              {openId !== m.id && <span className="mt-3 line-clamp-2 block text-sm leading-relaxed">{m.message}</span>}
            </button>
            {openId === m.id && <ThreadView id={m.id} canUpdate={canUpdate} onChanged={load} />}
          </li>
        ))}
      </ul>

      <SavedReplyManager />
    </div>
  )
}

function ThreadView({ id, canUpdate, onChanged }: { id: string; canUpdate: boolean; onChanged: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null)
  const [saved, setSaved] = useState<{ replies: SavedReply[]; site: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try { setThread(await api(`/api/admin/messages/${id}`)) } catch (e) { setError((e as Error).message) }
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => { api('/api/admin/saved-replies').then(setSaved).catch(() => setSaved(null)) }, [])

  async function send() {
    setSending(true)
    setError('')
    setNotice('')
    try {
      const body = await api(`/api/admin/messages/${id}/reply`, { method: 'POST', body: JSON.stringify({ body: draft }) })
      setDraft('')
      setNotice(body.emailConfigured ? 'Reply sent.' : 'Reply saved. Email isn’t set up yet, so it will go out once it is.')
      await load()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  async function setStatus(status: Message['status']) {
    try {
      await api('/api/admin/messages', { method: 'PUT', body: JSON.stringify({ id, status }) })
      await load()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!thread) return <div className="px-5 pb-5">{error ? <p role="alert" className="text-sm text-final-ember">{error}</p> : <div className="skeleton h-24 rounded-lg" />}</div>
  const { message: m } = thread

  return (
    <div className="space-y-4 border-t border-final-off-white/10 px-5 pb-5 pt-4">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.message}</p>
      {m.topic === 'privacy' && (
        <p className="text-xs text-final-muted">Personal data requests must be answered within the time the Nigeria Data Protection Act allows. Confirm the person’s identity (e.g. that they own the order email) before sharing or deleting anything.</p>
      )}

      {thread.replies.map((r) => (
        <div key={r.id} className="rounded-lg border border-final-off-white/10 bg-final-black/40 p-4">
          <p className="mb-1 text-xs text-final-muted">{r.author_email ?? 'Staff'} replied · {when(r.created_at)}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
        </div>
      ))}

      {thread.canSeeOrders && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-final-muted">Orders from {m.email}</p>
          {thread.orders.length ? (
            <ul className="divide-y divide-final-off-white/10 rounded-lg border border-final-off-white/10 text-sm">
              {thread.orders.map((o) => (
                <li key={o.order_number} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <Link href={`/studio/orders?q=${encodeURIComponent(o.order_number)}`} className="font-mono underline underline-offset-2">{o.order_number}</Link>
                  <span className="text-xs text-final-muted">{new Date(o.created_at).toLocaleDateString('en-GB')} · {o.status.replace(/_/g, ' ')}</span>
                  <span>{money(o.total, o.currency)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-final-muted">No orders under this email address.</p>}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-final-ember">{error}</p>}
      {notice && <p role="status" className="text-sm text-final-muted">{notice}</p>}

      {thread.canReply && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-final-muted" htmlFor={`reply-${id}`}>Reply to {m.name}</label>
          {saved && (
            <select aria-label="Use a saved reply" value="" onChange={(e) => {
              const r = saved.replies.find((x) => (x.id ?? x.key) === e.target.value)
              if (r) setDraft(fillReply(r.body, { name: m.name, orderNumber: m.order_number, site: saved.site }))
            }} className="w-full rounded-lg border border-final-off-white/15 bg-transparent px-3 py-2 text-sm">
              <option value="">Use a saved reply…</option>
              {saved.replies.map((r) => <option key={r.id ?? r.key} value={r.id ?? r.key ?? ''}>{r.title}</option>)}
            </select>
          )}
          <textarea id={`reply-${id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} maxLength={5000}
            className="w-full rounded-lg border border-final-off-white/15 bg-transparent px-3 py-2 text-sm leading-relaxed" />
          <p className="text-xs text-final-muted">Sent to {m.email} from the store address, with the subject “Re: {TOPIC_SUBJECT[m.topic]}{m.reference ? ` [${m.reference}]` : ''}”.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {thread.canReply && <button onClick={send} disabled={sending || !draft.trim()} className="btn-primary px-4 py-2 disabled:opacity-50">{sending ? 'Sending…' : 'Send reply'}</button>}
        {canUpdate && m.status !== 'replied' && <button onClick={() => setStatus('replied')} className="btn-secondary px-4 py-2">Mark replied</button>}
        {canUpdate && m.status !== 'closed' && <button onClick={() => setStatus('closed')} className="btn-secondary px-4 py-2">Close</button>}
        {canUpdate && m.status === 'closed' && <button onClick={() => setStatus('open')} className="btn-secondary px-4 py-2">Reopen</button>}
      </div>
    </div>
  )
}

// What the reply's subject calls each topic (lib/email/templates TOPICS), so staff see it before sending.
const TOPIC_SUBJECT: Record<string, string> = { order: 'About an order', return: 'Return or refund', privacy: 'Personal data request', other: 'General enquiry' }

function SavedReplyManager() {
  const [data, setData] = useState<{ replies: SavedReply[]; canUpdate: boolean } | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; key: string | null; title: string; body: string } | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => { api('/api/admin/saved-replies').then(setData).catch((e) => setError(e.message)) }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!editing) return
    try {
      await api('/api/admin/saved-replies', { method: 'PUT', body: JSON.stringify(editing) })
      setEditing(null)
      load()
    } catch (e) { setError((e as Error).message) }
  }
  async function remove(id: string) {
    try { await api(`/api/admin/saved-replies?id=${id}`, { method: 'DELETE' }); load() } catch (e) { setError((e as Error).message) }
  }

  if (!data) return null
  return (
    <details className="mt-10 rounded-xl border border-final-off-white/10 p-5">
      <summary className="cursor-pointer text-sm font-semibold">Saved replies</summary>
      <p className="mt-2 text-xs text-final-muted">Pick one in a reply box, edit it there, then send. In the text, {'{name}'} becomes the customer’s first name, {'{order}'} their order number and {'{track}'} the tracking page link.</p>
      {error && <p role="alert" className="mt-2 text-sm text-final-ember">{error}</p>}
      <ul className="mt-3 space-y-2">
        {data.replies.map((r) => (
          <li key={r.id ?? r.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{r.title}{r.key && !r.id && <span className="text-xs text-final-muted"> · built-in</span>}</span>
            {data.canUpdate && (
              <span className="flex gap-2">
                <button onClick={() => setEditing({ id: r.id, key: r.key, title: r.title, body: r.body })} className="btn-secondary px-3 py-1">Edit</button>
                {r.id && <button onClick={() => remove(r.id!)} className="btn-secondary px-3 py-1">{r.key ? 'Restore built-in' : 'Delete'}</button>}
              </span>
            )}
          </li>
        ))}
      </ul>
      {data.canUpdate && !editing && <button onClick={() => setEditing({ id: null, key: null, title: '', body: '' })} className="btn-secondary mt-3 px-3 py-1">Add a saved reply</button>}
      {editing && (
        <div className="mt-4 space-y-2">
          <input aria-label="Title" value={editing.title} maxLength={80} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title"
            className="w-full rounded-lg border border-final-off-white/15 bg-transparent px-3 py-2 text-sm" />
          <textarea aria-label="Reply text" value={editing.body} maxLength={3000} rows={7} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            className="w-full rounded-lg border border-final-off-white/15 bg-transparent px-3 py-2 text-sm leading-relaxed" />
          <div className="flex gap-2">
            <button onClick={save} disabled={!editing.title.trim() || !editing.body.trim()} className="btn-primary px-4 py-2 disabled:opacity-50">Save</button>
            <button onClick={() => setEditing(null)} className="btn-secondary px-4 py-2">Cancel</button>
          </div>
        </div>
      )}
    </details>
  )
}
