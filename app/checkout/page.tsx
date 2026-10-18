'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FiAlertCircle, FiLock } from 'react-icons/fi'
import Link from 'next/link'
import { useCart } from '@/components/providers/CartProvider'
import { formatCurrency } from '@/lib/utils/format'
import { Layout } from '@/components/layout/Layout'
import { track } from '@/lib/analytics'
import { POLICY } from '@/lib/legal'
import { formatDay } from '@/lib/catalog'
import { PENDING_CHECKOUT_KEY, quoteLineAt, useQuote } from '@/lib/useQuote'
const formatDate = (d: string) => formatDay(d, { day: 'numeric', month: 'short', year: 'numeric' })

export default function CheckoutPage() {
  const { items, total, promoCode, setPromoCode } = useCart()
  const trackedCheckout = useRef(false)
  useEffect(() => {
    if (items.length && !trackedCheckout.current) {
      trackedCheckout.current = true
      track('checkout_started')
    }
  }, [items.length])
  const [email, setEmail] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateValue, setStateValue] = useState('')
  const [postalCode, setPostalCode] = useState('')
  // We deliver within Nigeria only (lib/legal.ts), so the country is fixed.
  const country = POLICY.shipsTo
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'redirecting' | 'error'>('idle')
  const [message, setMessage] = useState('')
  // The server's price: exactly what Flutterwave will charge.
  const { quote, loading: pricing, error: quoteError } = useQuote(items, promoCode, email)
  const lineIssues = quote?.lines?.some((l) => l.issue) ?? false

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!items.length) {
      setMessage('Your cart is empty.')
      setStatus('error')
      return
    }

    if (!email || !shippingAddress || !city || !postalCode || !country) {
      setMessage('Please complete all shipping details.')
      setStatus('error')
      return
    }
    if (!termsAccepted) {
      setMessage('Please accept the Terms of Sale and Returns Policy.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setMessage('')

    const payload = {
      email,
      shippingAddress,
      shippingCity: city,
      shippingState: stateValue,
      shippingPostalCode: postalCode,
      shippingCountry: country,
      // Only what the server uses: it prices from the catalogue. Cart items also
      // carry the product photo, which alone can exceed the request size limit.
      items: items.map((item) => ({
        id: item.id,
        size: item.size ?? null,
        color: item.color ?? null,
        quantity: item.quantity,
      })),
      promoCode: promoCode || null,
      termsAccepted,
    }

    let response: Response
    let data: any = {}
    try {
      response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      data = await response.json().catch(() => ({}))
    } catch {
      setStatus('error')
      setMessage('We couldn’t reach the shop. Check your connection and try again.')
      return
    }

    if (!response.ok || typeof data.paymentUrl !== 'string') {
      setStatus('error')
      setMessage(data?.error || 'We couldn’t start your payment. Nothing was charged. Please try again.')
      return
    }

    // No order exists yet: it is placed once Flutterwave confirms the payment.
    // The cart stays until then, so a failed payment loses nothing.
    track('order_placed')
    try {
      sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ checkout: data.checkout, email }))
    } catch {}
    setStatus('redirecting')
    window.location.assign(data.paymentUrl)
  }

  if (!items.length) {
    return (
      <Layout>
        <div className="min-h-screen bg-final-black pt-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
            <h1 className="display text-4xl text-final-off-white mb-4">Checkout</h1>
            <p className="text-final-off-white/70 mb-8">Your cart is empty. Add something to your cart before placing an order.</p>
            <Link href="/shop">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-final-accent text-final-black px-8 py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
              >
                Continue Shopping
              </motion.button>
            </Link>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-final-black pt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <h1 className="display text-3xl md:text-4xl text-final-off-white mb-6">Checkout</h1>
                <p className="text-final-off-white/70 mb-6">Enter your delivery details, then pay securely on Flutterwave. Your order is placed once payment is confirmed. No account is required.</p>
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div>
                    <label className="block text-final-off-white/80 mb-2" htmlFor="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full px-4 py-3 rounded-lg bg-final-gray border border-final-light-gray/30 text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent"
                      placeholder="you@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-final-off-white/80 mb-2" htmlFor="shippingAddress">Shipping Address</label>
                    <input
                      id="shippingAddress"
                      type="text"
                      value={shippingAddress}
                      onChange={(event) => setShippingAddress(event.target.value)}
                      className="w-full px-4 py-3 rounded-lg bg-final-gray border border-final-light-gray/30 text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent"
                      placeholder="123 Main St"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-final-off-white/80 mb-2" htmlFor="city">City</label>
                      <input
                        id="city"
                        type="text"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-final-gray border border-final-light-gray/30 text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="block text-final-off-white/80 mb-2" htmlFor="state">State</label>
                      <input
                        id="state"
                        type="text"
                        value={stateValue}
                        onChange={(event) => setStateValue(event.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-final-gray border border-final-light-gray/30 text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent"
                        placeholder="State"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-final-off-white/80 mb-2" htmlFor="postalCode">Postal Code</label>
                      <input
                        id="postalCode"
                        type="text"
                        value={postalCode}
                        onChange={(event) => setPostalCode(event.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-final-gray border border-final-light-gray/30 text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent"
                        placeholder="ZIP / Postal Code"
                      />
                    </div>
                    <div>
                      <label className="block text-final-off-white/80 mb-2" htmlFor="country">Country</label>
                      <input
                        id="country"
                        type="text"
                        value={country}
                        readOnly
                        aria-describedby="country-note"
                        className="w-full px-4 py-3 rounded-lg bg-final-gray border border-final-light-gray/30 text-final-muted focus:outline-none"
                      />
                      <p id="country-note" className="mt-1 text-xs text-final-muted">We deliver within {POLICY.shipsTo} only.</p>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 text-sm text-final-muted">
                    <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0 accent-final-ember" />
                    <span>
                      I agree to the <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-final-off-white">Terms of Sale</Link> and{' '}
                      <Link href="/returns" target="_blank" className="underline underline-offset-2 hover:text-final-off-white">Returns Policy</Link>.
                      We use your details to process your order as described in our{' '}
                      <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-final-off-white">Privacy Policy</Link>.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={status === 'loading' || status === 'redirecting' || !quote?.ok || pricing}
                    className="w-full bg-final-accent text-final-black py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300 disabled:opacity-50"
                  >
                    {status === 'redirecting'
                      ? 'Taking you to Flutterwave…'
                      : status === 'loading'
                        ? 'Starting payment…'
                        : quote
                          ? `Pay ${formatCurrency(quote.total)}`
                          : quoteError ? 'Checkout unavailable' : 'Checking prices…'}
                  </button>
                  <p className="flex items-center justify-center gap-1.5 text-sm text-final-muted">
                    <FiLock className="h-4 w-4" /> Card, bank transfer or USSD on Flutterwave&apos;s secure page
                  </p>
                </form>

                {quoteError && !pricing && (
                  <p className="mt-5 text-sm text-red-400" role="alert">We couldn’t check prices right now, so payment is paused. Please refresh in a moment.</p>
                )}
                {lineIssues && (
                  <p className="mt-5 flex items-start gap-1.5 text-sm text-red-400" role="alert">
                    <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Some items in your cart can&apos;t be bought right now. <Link href="/cart" className="underline underline-offset-2">Review your cart</Link></span>
                  </p>
                )}
                {promoCode && quote?.promoError && (
                  <p className="mt-5 text-sm text-red-400" role="alert">
                    {quote.promoError}{' '}
                    <button type="button" onClick={() => setPromoCode('')} className="underline underline-offset-2">Remove code</button>
                  </p>
                )}
                {message && (
                  <p className="mt-5 text-sm text-red-400" role="alert">
                    {message}
                  </p>
                )}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <h2 className="text-2xl font-bold text-final-off-white mb-4">Order Summary</h2>
                <div className="space-y-4">
                  {items.map((item, index) => {
                    const line = quoteLineAt(quote, items, index)
                    const details = [`Qty ${item.quantity}`, line?.size ?? item.size, line?.color ?? item.color].filter(Boolean).join(' • ')
                    return (
                      <div key={`${item.id}-${item.size}-${item.color ?? ''}`} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-final-off-white">{item.name}</p>
                          <p className="text-final-off-white/70 text-sm">{details}</p>
                          {line?.preorder && line.shipsOn && <p className="text-sm text-final-ember">Pre-order · ships from {formatDate(line.shipsOn)}</p>}
                          {line?.issue && <p className="text-sm text-red-400">{line.issue}</p>}
                        </div>
                        <p className="shrink-0 text-final-accent font-bold">{formatCurrency(line ? Number(line.lineTotal) : item.price * item.quantity)}</p>
                      </div>
                    )
                  })}
                </div>
                <div className="border-t border-final-light-gray/30 mt-6 pt-6">
                  <div className="flex justify-between text-final-off-white/70 mb-2">
                    <span>Subtotal</span>
                    <span>{formatCurrency(quote ? quote.subtotal : total)}</span>
                  </div>
                  {quote && Number(quote.discount) > 0 && (
                    <div className="flex justify-between text-final-accent mb-2">
                      <span>Discount{quote.promo ? ` (${quote.promo.code})` : ''}</span>
                      <span>-{formatCurrency(quote.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-final-off-white/70 mb-2">
                    <span>Shipping</span>
                    <span>Free</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold text-final-off-white">
                    <span>Total</span>
                    <span>{formatCurrency(quote ? quote.total : total)}</span>
                  </div>
                  {quote?.isPreorder && (
                    <p className="mt-3 text-sm text-final-muted">Your order includes pre-order items. They ship from the date shown; we deliver everything together unless we tell you otherwise.</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

    </Layout>
  )
}
