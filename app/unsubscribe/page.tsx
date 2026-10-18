'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Layout } from '@/components/layout/Layout'

function Unsubscribe() {
  const token = useSearchParams().get('token') ?? ''
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  // A button rather than unsubscribing on page load, so link scanners in
  // email clients can't unsubscribe people by prefetching the link.
  async function confirm() {
    setState('working')
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      setMessage(data.message || data.error || '')
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-32 text-center">
      <h1 className="display text-3xl">Unsubscribe</h1>
      {state === 'done' ? (
        <p className="mt-4 text-final-muted" role="status">{message}</p>
      ) : (
        <>
          <p className="mt-4 text-final-muted">Stop receiving marketing emails from Final Heaven. Order emails aren’t affected.</p>
          {!token && <p className="mt-4 text-sm text-final-ember">This link is missing its unsubscribe code. Use the link from one of our emails.</p>}
          {state === 'error' && <p role="alert" className="mt-4 text-sm text-final-ember">{message}</p>}
          <button type="button" onClick={confirm} disabled={!token || state === 'working'} className="btn-primary mt-8 disabled:opacity-50">
            {state === 'working' ? 'Unsubscribing' : 'Unsubscribe'}
          </button>
        </>
      )}
      <p className="mt-8 text-sm">
        <Link href="/privacy" className="text-final-muted underline underline-offset-4 hover:text-final-off-white">Privacy Policy</Link>
      </p>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Layout>
      <Suspense>
        <Unsubscribe />
      </Suspense>
    </Layout>
  )
}
