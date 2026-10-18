'use client'

import Link from 'next/link'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FiCheck, FiClock, FiX } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { useCart } from '@/components/providers/CartProvider'
import { track } from '@/lib/analytics'
import { PENDING_CHECKOUT_KEY } from '@/lib/useQuote'

type Result =
  | { state: 'checking' }
  | { state: 'paid'; orderNumber: string; trackingNumber: string; isPreorder: boolean }
  | { state: 'pending' }
  | { state: 'failed' }
  | { state: 'error'; message: string }

function readPending(): { checkout: string; email: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CHECKOUT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Where Flutterwave returns the customer. The `status` it appends is ignored:
 * the server verifies the transaction with Flutterwave, and only then does the
 * order exist. This page shows the order number and tracking only after that.
 */
function PaymentResult() {
  const params = useSearchParams()
  const { clearCart } = useCart()
  const [result, setResult] = useState<Result>({ state: 'checking' })
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState('')
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
        if (res.ok && data.paymentStatus === 'paid' && data.orderNumber) {
          // Only after the server verified the payment with Flutterwave and placed the order.
          track('payment_completed')
          clearCart()
          try { sessionStorage.removeItem(PENDING_CHECKOUT_KEY) } catch {}
          return setResult({ state: 'paid', orderNumber: data.orderNumber, trackingNumber: data.trackingNumber, isPreorder: Boolean(data.isPreorder) })
        }
        if (res.ok && data.paymentStatus === 'failed') return setResult({ state: 'failed' })
        // Still processing at Flutterwave, or briefly unreachable: check a few more times.
        if (tries < 6 && (res.ok || res.status === 503)) return void setTimeout(check, 3000)
        if (res.ok || res.status === 503) return setResult({ state: 'pending' })
        setResult({ state: 'error', message: data.error || 'We couldn’t check this payment.' })
      } catch {
        if (tries < 6) return void setTimeout(check, 3000)
        setResult({ state: 'pending' })
      }
    }
    check()
  }, [params, clearCart])

  const retry = async () => {
    const pending = readPending()
    if (!pending) {
      setRetryError('Please go back to your cart and check out again.')
      return
    }
    setRetrying(true)
    setRetryError('')
    try {
      const res = await fetch('/api/payments/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && typeof data.paymentUrl === 'string') return window.location.assign(data.paymentUrl)
      setRetryError(data.error || 'We couldn’t start a new payment. Please try again from your cart.')
    } catch {
      setRetryError('We couldn’t reach the shop. Check your connection and try again.')
    }
    setRetrying(false)
  }

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
          <h1 className="display mt-6 text-3xl">Confirming your payment</h1>
          <p className="mt-3 text-final-muted">We’re checking with Flutterwave. This takes a few seconds.</p>
        </>
      )}
      {result.state === 'paid' && (
        <>
          <h1 className="display mt-6 text-3xl">Order placed</h1>
          <p className="mt-3 text-final-muted">
            Payment received. {result.isPreorder ? 'We’ll ship your pre-order from the date shown on the product, and' : 'We’re preparing your order and'} we’ll email you when it ships.
          </p>
          <dl className="mx-auto mt-6 grid max-w-sm grid-cols-1 gap-4 rounded-xl border border-final-off-white/10 bg-final-gray p-5 text-left sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-final-muted">Order number</dt>
              <dd className="mt-1 font-mono text-lg">{result.orderNumber}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-final-muted">Tracking number</dt>
              <dd className="mt-1 font-mono text-lg">{result.trackingNumber}</dd>
            </div>
          </dl>
        </>
      )}
      {result.state === 'pending' && (
        <>
          <h1 className="display mt-6 text-3xl">Payment processing</h1>
          <p className="mt-3 text-final-muted">
            Flutterwave hasn’t confirmed it yet, which can happen with bank transfers. You don’t need to pay again: your order is placed automatically once it does, and we’ll email you.
          </p>
        </>
      )}
      {result.state === 'failed' && (
        <>
          <h1 className="display mt-6 text-3xl">Payment didn’t go through</h1>
          <p className="mt-3 text-final-muted">
            No order was placed and your cart is saved. You can try again. If you were charged anyway, contact us and we’ll sort it out.
          </p>
        </>
      )}
      {result.state === 'error' && (
        <>
          <h1 className="display mt-6 text-3xl">We couldn’t check this payment</h1>
          <p className="mt-3 text-final-muted">{result.message}</p>
        </>
      )}

      {retryError && <p className="mt-4 text-sm text-red-400" role="alert">{retryError}</p>}

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        {result.state === 'paid' && (
          <Link href={`/track-order?orderNumber=${result.orderNumber}`} className="btn-primary">Track order</Link>
        )}
        {result.state === 'failed' && (
          <button type="button" onClick={retry} disabled={retrying} className="btn-primary disabled:opacity-50">
            {retrying ? 'Opening Flutterwave…' : 'Try payment again'}
          </button>
        )}
        {(result.state === 'failed' || result.state === 'error') && <Link href="/cart" className="btn-secondary">Back to cart</Link>}
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
