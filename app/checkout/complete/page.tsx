'use client'

import Link from 'next/link'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FiCheck, FiClock, FiX } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'

type Result =
  | { state: 'checking' }
  | { state: 'paid'; orderNumber: string }
  | { state: 'pending'; orderNumber?: string }
  | { state: 'failed'; orderNumber?: string }
  | { state: 'error'; message: string }

/**
 * Where Flutterwave returns the customer. The `status` it appends is ignored:
 * the server verifies the transaction with Flutterwave before anything is
 * marked paid, and this page only shows what the server concluded.
 */
function PaymentResult() {
  const params = useSearchParams()
  const [result, setResult] = useState<Result>({ state: 'checking' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const reference = params.get('ref') || params.get('tx_ref')
    const transactionId = params.get('transaction_id')
    if (!reference) {
      setResult({ state: 'error', message: 'This link is missing its payment reference.' })
      return
    }

    let tries = 0
    const check = async () => {
      tries += 1
      try {
        const res = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference, transactionId }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.paymentStatus === 'paid') return setResult({ state: 'paid', orderNumber: data.orderNumber })
        if (res.ok && data.paymentStatus === 'failed') return setResult({ state: 'failed', orderNumber: data.orderNumber })
        // Still processing at Flutterwave, or briefly unreachable: check a few more times.
        if (tries < 5 && (res.ok || res.status === 503)) return void setTimeout(check, 3000)
        if (res.ok) return setResult({ state: 'pending', orderNumber: data.orderNumber })
        setResult({ state: res.status === 503 ? 'pending' : 'error', message: data.error || 'We couldn’t check this payment.' } as Result)
      } catch {
        if (tries < 5) return void setTimeout(check, 3000)
        setResult({ state: 'pending' })
      }
    }
    check()
  }, [params])

  const icon = {
    checking: <FiClock className="h-6 w-6" />,
    paid: <FiCheck className="h-6 w-6" />,
    pending: <FiClock className="h-6 w-6" />,
    failed: <FiX className="h-6 w-6" />,
    error: <FiX className="h-6 w-6" />,
  }[result.state]

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-32 text-center" aria-live="polite">
      <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full border ${
        result.state === 'paid' ? 'border-final-ember text-final-ember' : 'border-final-off-white/20 text-final-off-white'
      }`}>
        {icon}
      </div>

      {result.state === 'checking' && (
        <>
          <h1 className="display mt-6 text-3xl">Checking your payment</h1>
          <p className="mt-3 text-final-muted">We’re confirming with Flutterwave. This takes a few seconds.</p>
        </>
      )}
      {result.state === 'paid' && (
        <>
          <h1 className="display mt-6 text-3xl">Payment received</h1>
          <p className="mt-3 text-final-muted">
            Order <span className="font-mono text-final-off-white">{result.orderNumber}</span> is confirmed. We’ll email you when it ships.
          </p>
        </>
      )}
      {result.state === 'pending' && (
        <>
          <h1 className="display mt-6 text-3xl">Payment processing</h1>
          <p className="mt-3 text-final-muted">
            Flutterwave hasn’t confirmed it yet. You don’t need to pay again: your order updates automatically once it does.
          </p>
        </>
      )}
      {result.state === 'failed' && (
        <>
          <h1 className="display mt-6 text-3xl">Payment didn’t go through</h1>
          <p className="mt-3 text-final-muted">
            Flutterwave reported this attempt as failed. You can try again from the Track Order page. If you were charged anyway, contact us with your order number.
          </p>
        </>
      )}
      {result.state === 'error' && (
        <>
          <h1 className="display mt-6 text-3xl">We couldn’t check this payment</h1>
          <p className="mt-3 text-final-muted">{result.message}</p>
        </>
      )}

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href={'orderNumber' in result && result.orderNumber ? `/track-order?orderNumber=${result.orderNumber}` : '/track-order'}
          className="btn-primary"
        >
          Track order
        </Link>
        <Link href="/shop" className="btn-secondary">Back to the shop</Link>
      </div>
    </div>
  )
}

export default function CheckoutCompletePage() {
  return (
    <Layout>
      <Suspense>
        <PaymentResult />
      </Suspense>
    </Layout>
  )
}
