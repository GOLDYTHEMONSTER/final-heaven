'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FiClock, FiGift, FiUsers } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { WAITLIST_CONSENT } from '@/lib/consent'

// Membership isn't live yet. Everything here is described as planned, and
// signing up joins a waitlist. No payment is taken and nothing is promised.
const planned = [
  { icon: FiClock, title: 'Early access', description: 'A head start on new drops before they open to everyone.' },
  { icon: FiGift, title: 'Member-only pieces', description: 'Some releases set aside for members.' },
  { icon: FiUsers, title: 'Community', description: 'A members’ space to hear about drops and events first.' },
]

export default function MembershipPage() {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (!consent) {
      setState('error')
      setMessage('Please tick the box so we can email you when membership opens.')
      return
    }
    setState('loading')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), consent, source: 'membership_waitlist' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not join the waitlist.')
      setState('done')
      setMessage('You’re on the waitlist. We’ll email you when membership opens.')
    } catch (err) {
      setState('error')
      setMessage((err as Error).message)
    }
  }

  return (
    <Layout>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-32 sm:px-6 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-final-muted">Coming soon</p>
        <h1 className="display mt-4 text-5xl md:text-7xl">Membership</h1>
        <p className="mt-6 max-w-[52ch] text-lg text-final-muted">
          We’re building a membership for people who never want to miss a drop. It isn’t open yet. Join the waitlist and we’ll tell you first when it is.
        </p>

        <section aria-labelledby="planned-heading" className="mt-16">
          <h2 id="planned-heading" className="text-xl font-semibold">What we’re planning</h2>
          <p className="mt-1 text-sm text-final-muted">Plans may change before launch. We’ll publish the final benefits and any price before anyone joins.</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {planned.map(({ icon: Icon, title, description }) => (
              <li key={title} className="rounded-xl border border-final-off-white/10 bg-final-gray p-6">
                <Icon className="h-5 w-5 text-final-muted" strokeWidth={1.75} />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-final-muted">{description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="waitlist-heading" className="mt-16 max-w-xl rounded-2xl border border-final-off-white/10 bg-final-gray p-6 md:p-8">
          <h2 id="waitlist-heading" className="display text-2xl">Join the waitlist</h2>
          {state === 'done' ? (
            <p role="status" className="mt-4 text-final-muted">{message}</p>
          ) : (
            <form onSubmit={join} noValidate className="mt-5 space-y-4">
              <div>
                <label htmlFor="waitlist-email" className="mb-2 block text-sm font-medium text-final-off-white/80">Email address</label>
                <input id="waitlist-email" type="email" autoComplete="email" inputMode="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                  className="w-full rounded-lg border border-final-off-white/15 bg-final-black px-4 py-3 text-sm placeholder:text-final-muted focus:border-final-off-white/60 focus:outline-none" />
              </div>
              <label className="flex items-start gap-2 text-xs text-final-muted">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-final-ember" />
                <span>{WAITLIST_CONSENT} See our <Link href="/privacy" className="underline underline-offset-2 hover:text-final-off-white">Privacy Policy</Link>.</span>
              </label>
              {state === 'error' && <p role="alert" className="text-sm text-final-ember">{message}</p>}
              <button type="submit" disabled={state === 'loading'} className="btn-primary disabled:opacity-60">
                {state === 'loading' ? 'Joining' : 'Join the waitlist'}
              </button>
            </form>
          )}
        </section>
      </main>
    </Layout>
  )
}
