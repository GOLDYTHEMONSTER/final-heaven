'use client'

import Link from 'next/link'
import { useState } from 'react'

const TOPICS = [
  { value: 'order', label: 'A question about my order' },
  { value: 'return', label: 'A return, refund or faulty item' },
  { value: 'privacy', label: 'My personal data' },
  { value: 'other', label: 'Something else' },
]

export function ContactForm({ defaultTopic = 'order' }: { defaultTopic?: string }) {
  const [form, setForm] = useState({ name: '', email: '', orderNumber: '', topic: defaultTopic, message: '', website: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Your message couldn’t be sent. Please try again.')
      setState('sent')
    } catch (err) {
      setState('error')
      setError((err as Error).message)
    }
  }

  if (state === 'sent') {
    return (
      <div role="status" className="rounded-xl border border-final-off-white/10 bg-final-gray p-6">
        <p className="font-semibold">Thanks, we’ve got your message.</p>
        <p className="mt-1 text-sm text-final-muted">We’ll reply to {form.email} as soon as we can.</p>
      </div>
    )
  }

  const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-4 py-3 text-sm placeholder:text-final-muted focus:border-final-off-white/60 focus:outline-none'
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-final-off-white/10 bg-final-gray p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className="mb-2 block text-sm font-medium text-final-off-white/80">Your name</label>
          <input id="c-name" autoComplete="name" value={form.name} onChange={set('name')} className={field} />
        </div>
        <div>
          <label htmlFor="c-email" className="mb-2 block text-sm font-medium text-final-off-white/80">Email</label>
          <input id="c-email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} className={field} />
        </div>
        <div>
          <label htmlFor="c-topic" className="mb-2 block text-sm font-medium text-final-off-white/80">What’s it about?</label>
          <select id="c-topic" value={form.topic} onChange={set('topic')} className={field}>
            {TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="c-order" className="mb-2 block text-sm font-medium text-final-off-white/80">Order number <span className="text-final-muted">(if you have one)</span></label>
          <input id="c-order" value={form.orderNumber} onChange={set('orderNumber')} placeholder="FH-…" className={`${field} font-mono uppercase`} />
        </div>
      </div>
      <div>
        <label htmlFor="c-message" className="mb-2 block text-sm font-medium text-final-off-white/80">Message</label>
        <textarea id="c-message" rows={5} value={form.message} onChange={set('message')} className={field} />
      </div>
      {/* Honeypot for bots; hidden from people and screen readers. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set('website')} name="website"
        className="absolute left-[-9999px] h-0 w-0 opacity-0" />
      <p className="text-xs text-final-muted">We use your details only to reply. See our <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.</p>
      {state === 'error' && <p role="alert" className="text-sm text-final-ember">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className="btn-primary disabled:opacity-60">
        {state === 'sending' ? 'Sending' : 'Send message'}
      </button>
    </form>
  )
}
