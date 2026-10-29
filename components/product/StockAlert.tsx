'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ALERT_CONSENT } from '@/lib/consent'

/**
 * "Email me when it's available", shown under a sold-out or coming-soon
 * product. Same field, button and consent styling as the footer's newsletter
 * form; posts to /api/alerts, which answers the same for new and known addresses.
 */
export function StockAlert({ productId }: { productId: string }) {
  const [address, setAddress] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!address.trim()) { setStatus('error'); setMessage('Enter a valid email.'); return }
    if (!consent) { setStatus('error'); setMessage('Please tick the box to agree to receive this email.'); return }
    setStatus('loading')
    setMessage('')
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address.trim(), consent, productId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setStatus('error'); setMessage(data.error || 'Something went wrong. Please try again.'); return }
      setStatus('success')
      setMessage(data.message || 'Thanks. We’ll email you once, when it’s available.')
      setAddress('')
      setConsent(false)
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-lg border border-final-light-gray/30 p-4">
      <label htmlFor="stock-alert-email" className="mb-2 block text-sm font-semibold text-final-off-white">Email me when it’s available</label>
      <div className="flex gap-2">
        <input
          id="stock-alert-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          aria-invalid={status === 'error'}
          aria-describedby="stock-alert-message"
          className="min-w-0 flex-1 rounded-lg border border-final-off-white/15 bg-final-gray px-4 py-2.5 text-sm text-final-off-white placeholder:text-final-muted/70 transition-colors focus:border-final-off-white/50 focus:outline-none"
          placeholder="you@example.com"
        />
        <button type="submit" disabled={status === 'loading'} className="btn-primary px-5 disabled:opacity-60">
          {status === 'loading' ? 'Saving' : 'Notify me'}
        </button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-final-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-final-ember" />
        <span>
          {ALERT_CONSENT} See our{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-final-off-white">Privacy Policy</Link>.
        </span>
      </label>
      <p id="stock-alert-message" role="status" className={`mt-2 min-h-[1.25rem] text-sm ${status === 'success' ? 'text-final-off-white' : 'text-final-ember'}`}>
        {message}
      </p>
    </form>
  )
}
