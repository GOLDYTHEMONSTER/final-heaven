'use client'

import Link from 'next/link'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiCheck, FiClock, FiX } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { PENDING_TICKETS_KEY } from '@/components/events/TicketPicker'

type Result =
  | { state: 'checking' }
  | { state: 'paid'; orderNumber: string; event: string | null }
  | { state: 'pending'; event: string | null }
  | { state: 'failed'; event: string | null }
  | { state: 'error'; message: string }

function readPending(): { email: string; event: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TICKETS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Where Flutterwave returns ticket buyers. As for shop orders, the status it
 * appends is ignored: the server verifies the payment and only then are the
 * tickets issued. The buyer goes straight to their tickets when this browser
 * still has the email they bought with; otherwise the email has them.
 */
function TicketResult() {
  const params = useSearchParams()
  const router = useRouter()
  const [result, setResult] = useState<Result>({ state: 'checking' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const reference = params.get('ref') || params.get('tx_ref')
    const transactionId = params.get('transaction_id')
    if (!reference) return setResult({ state: 'error', message: 'This link is missing its payment reference.' })
    const pending = readPending()

    let tries = 0
    const check = async () => {
      tries += 1
      try {
        const res = await fetch('/api/events/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference, transactionId, email: pending?.email }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.paymentStatus === 'paid') {
          try { sessionStorage.removeItem(PENDING_TICKETS_KEY) } catch {}
          if (typeof data.tickets === 'string') return router.replace(data.tickets)
          return setResult({ state: 'paid', orderNumber: data.orderNumber, event: data.event ?? null })
        }
        if (res.ok && data.paymentStatus === 'failed') return setResult({ state: 'failed', event: data.event ?? pending?.event ?? null })
        if (tries < 6 && (res.ok || res.status === 503)) return void setTimeout(check, 3000)
        if (res.ok || res.status === 503) return setResult({ state: 'pending', event: data.event ?? pending?.event ?? null })
        setResult({ state: 'error', message: data.error || 'We couldn’t check this payment.' })
      } catch {
        if (tries < 6) return void setTimeout(check, 3000)
        setResult({ state: 'pending', event: pending?.event ?? null })
      }
    }
    check()
  }, [params, router])

  const icon = result.state === 'paid' ? <FiCheck className="h-6 w-6" /> : result.state === 'failed' || result.state === 'error' ? <FiX className="h-6 w-6" /> : <FiClock className="h-6 w-6" />
  const back = 'event' in result && result.event ? `/events/${result.event}` : null

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-32 text-center" aria-live="polite">
      <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full border ${result.state === 'paid' ? 'border-final-ember text-final-ember' : 'border-final-off-white/20'}`}>{icon}</div>
      {result.state === 'checking' && (<>
        <h1 className="display mt-6 text-3xl">Confirming your payment</h1>
        <p className="mt-3 text-final-muted">We’re checking with Flutterwave. This takes a few seconds.</p>
      </>)}
      {result.state === 'paid' && (<>
        <h1 className="display mt-6 text-3xl">You’re in</h1>
        <p className="mt-3 text-final-muted">Payment received. We’ve emailed your tickets: open that email on your phone at the door. Order {result.orderNumber}.</p>
      </>)}
      {result.state === 'pending' && (<>
        <h1 className="display mt-6 text-3xl">Payment processing</h1>
        <p className="mt-3 text-final-muted">Flutterwave hasn’t confirmed it yet, which can happen with bank transfers. You don’t need to pay again: your tickets are emailed as soon as it does.</p>
      </>)}
      {result.state === 'failed' && (<>
        <h1 className="display mt-6 text-3xl">Payment didn’t go through</h1>
        <p className="mt-3 text-final-muted">No tickets were issued. You can try again. If you were charged anyway, contact us and we’ll sort it out.</p>
      </>)}
      {result.state === 'error' && (<>
        <h1 className="display mt-6 text-3xl">We couldn’t check this payment</h1>
        <p className="mt-3 text-final-muted">{result.message}</p>
      </>)}
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        {back && result.state !== 'paid' && <Link href={back} className="btn-primary">Back to the event</Link>}
        <Link href="/shop" className="btn-secondary">Back to the shop</Link>
      </div>
    </div>
  )
}

export default function TicketsCompletePage() {
  return (
    <Layout>
      <Suspense>
        <TicketResult />
      </Suspense>
    </Layout>
  )
}
