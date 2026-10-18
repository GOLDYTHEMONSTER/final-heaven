'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useCart } from '@/components/providers/CartProvider'
import { formatCurrency } from '@/lib/utils/format'
import { Layout } from '@/components/layout/Layout'

export default function CheckoutPage() {
  const router = useRouter()
  const { items, total, clearCart } = useCart()
  const [email, setEmail] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateValue, setStateValue] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [orderConfirmation, setOrderConfirmation] = useState<{
    orderNumber: string
    trackingNumber: string
    total: string
    paymentUrl: string | null
    paymentIssue: string | null
  } | null>(null)

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

    setStatus('loading')
    setMessage('')

    const payload = {
      email,
      shippingAddress,
      shippingCity: city,
      shippingState: stateValue,
      shippingPostalCode: postalCode,
      shippingCountry: country,
      items,
    }

    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      setStatus('error')
      setMessage(data?.error || 'Unable to create your order.')
      return
    }

    setStatus('success')
    setOrderConfirmation({
      orderNumber: data.orderNumber,
      trackingNumber: data.trackingNumber,
      total: data.total,
      paymentUrl: data.paymentUrl ?? null,
      paymentIssue: data.paymentIssue ?? null,
    })
    setMessage(`Order placed. Your order number is ${data.orderNumber}.`)
    clearCart()
  }

  if (!items.length && !orderConfirmation) {
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
                <p className="text-final-off-white/70 mb-6">Enter your shipping details and email to create an order. No account is required.</p>
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
                        onChange={(event) => setCountry(event.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-final-gray border border-final-light-gray/30 text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent"
                        placeholder="Country"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full bg-final-accent text-final-black py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300 disabled:opacity-50"
                  >
                    {status === 'loading' ? 'Placing Order…' : 'Place Order'}
                  </button>
                </form>

                {message && (
                  <p className={`mt-5 text-sm ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {message}
                  </p>
                )}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <h2 className="text-2xl font-bold text-final-off-white mb-4">Order Summary</h2>
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={`${item.id}-${item.size}`} className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-final-off-white">{item.name}</p>
                        <p className="text-final-off-white/70 text-sm">Qty {item.quantity} • {item.size}</p>
                      </div>
                      <p className="text-final-accent font-bold">{formatCurrency(item.price * item.quantity)}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-final-light-gray/30 mt-6 pt-6">
                  <div className="flex justify-between text-final-off-white/70 mb-2">
                    <span>Subtotal</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                  <div className="flex justify-between text-final-off-white/70 mb-2">
                    <span>Shipping</span>
                    <span>Free</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold text-final-off-white">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {orderConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-final-black/80 p-4 backdrop-blur-sm">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-placed-heading"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="w-full max-w-xl rounded-2xl border border-final-off-white/10 bg-final-gray p-6 md:p-8"
          >
            <h2 id="order-placed-heading" className="display text-3xl">Order placed</h2>
            <p className="mt-2 text-final-muted">
              {orderConfirmation.paymentUrl
                ? 'Complete payment to confirm your order. We start preparing it once payment is verified.'
                : 'Your order is saved. It will be confirmed once payment is received.'}
            </p>

            <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-final-muted">Order number</dt>
                <dd className="mt-1 font-mono text-lg">{orderConfirmation.orderNumber}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-final-muted">Tracking number</dt>
                <dd className="mt-1 font-mono text-lg">{orderConfirmation.trackingNumber}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-final-muted">Total</dt>
                <dd className="mt-1 text-lg tabular-nums">{formatCurrency(orderConfirmation.total)}</dd>
              </div>
            </dl>

            <div className="mt-6 rounded-xl border border-final-off-white/10 bg-final-black p-5">
              {orderConfirmation.paymentUrl ? (
                <>
                  <p className="text-sm text-final-muted">You’ll pay on Flutterwave’s secure checkout, then come back here.</p>
                  <a href={orderConfirmation.paymentUrl} className="btn-primary mt-4 w-full sm:w-auto">
                    Pay {formatCurrency(orderConfirmation.total)}
                  </a>
                </>
              ) : (
                <p className="text-sm text-final-muted">
                  {orderConfirmation.paymentIssue === 'provider_unavailable'
                    ? 'We couldn’t reach the payment service just now. You can pay from the Track Order page in a few minutes.'
                    : 'Online payment isn’t available right now. We’ll contact you at the email you entered to arrange payment.'}
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOrderConfirmation(null)} className="btn-secondary">
                Close
              </button>
              <button
                type="button"
                onClick={() => router.push(`/track-order?orderNumber=${orderConfirmation.orderNumber}`)}
                className="btn-secondary"
              >
                Track order
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </Layout>
  )
}
