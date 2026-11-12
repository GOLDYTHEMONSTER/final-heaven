'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FiAlertCircle, FiChevronDown, FiLock, FiTruck } from 'react-icons/fi'
import Link from 'next/link'
import { useCart } from '@/components/providers/CartProvider'
import { formatCurrency } from '@/lib/utils/format'
import { Layout } from '@/components/layout/Layout'
import { track } from '@/lib/analytics'
import { POLICY } from '@/lib/legal'
import { formatDay, paymentsClosed } from '@/lib/catalog'
import { CheckoutCountdown } from '@/components/launch/CheckoutCountdown'
import { PENDING_CHECKOUT_KEY, quoteLineAt, useQuote } from '@/lib/useQuote'
import type { DeliveryOption } from '@/lib/delivery'
import { storedAttribution } from '@/lib/attribution-client'
import { DeliveryChoice } from '@/components/cart/DeliveryChoice'
import { forgetCheckoutDetails, loadCheckoutDetails, saveCheckoutDetails } from '@/lib/checkout-details'
import { NIGERIAN_STATES, nigerianState } from '@/lib/nigeria'
import { CHECKOUT_FIELDS, validateCheckout, type CheckoutErrors } from '@/lib/checkout-validate'
const FIELD_BASE = 'w-full px-4 py-3 rounded-lg bg-final-gray border text-final-off-white placeholder-final-off-white/50 focus:outline-none'
const FIELD = `${FIELD_BASE} border-final-light-gray/30 focus:border-final-accent`
const fieldClass = (error?: string) => (error ? `${FIELD_BASE} border-red-400 focus:border-red-400` : FIELD)
// a field with a problem: red border, and screen readers read the message with the field
const invalid = (id: string, error?: string) => (error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {})
function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null
  return (
    <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm text-red-400">
      <FiAlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </p>
  )
}
const formatDate = (d: string) => formatDay(d, { day: 'numeric', month: 'short', year: 'numeric' })

export default function CheckoutPage() {
  const { items, total, promoCode, setPromoCode, gift } = useCart()
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
  // Details from a previous order on this device fill the form; the customer can untick to forget them.
  const [remember, setRemember] = useState(true)
  useEffect(() => {
    const saved = loadCheckoutDetails()
    if (!saved) return
    setEmail((v) => v || saved.email)
    setShippingAddress((v) => v || saved.address)
    setCity((v) => v || saved.city)
    setStateValue((v) => v || nigerianState(saved.state) || '')
    setPostalCode((v) => v || saved.postalCode)
  }, [])
  const [delivery, setDelivery] = useState<DeliveryOption>('standard')
  const [status, setStatus] = useState<'idle' | 'loading' | 'redirecting' | 'error'>('idle')
  const [message, setMessage] = useState('')
  // Field checks start on the first Pay tap, then follow every change, so a message goes as soon as it's fixed.
  const [tried, setTried] = useState(false)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const fields = { email, shippingAddress, state: stateValue, city, termsAccepted }
  useEffect(() => {
    if (tried) setErrors(validateCheckout({ email, shippingAddress, state: stateValue, city, termsAccepted }))
  }, [tried, email, shippingAddress, stateValue, city, termsAccepted])
  const errorCount = Object.keys(errors).length
  // The server's price: exactly what Flutterwave will charge.
  const { quote, loading: pricing, error: quoteError } = useQuote(items, promoCode, email, gift, delivery)
  // Express is offered only when something comes from China; otherwise the choice goes back to standard.
  const expressFee = quote?.delivery?.expressFee ?? null
  useEffect(() => {
    if (quote && expressFee == null && delivery === 'express') setDelivery('standard')
  }, [quote, expressFee, delivery])
  const lineIssues = (quote?.lines?.some((l) => l.issue) ?? false) || !!quote?.gift?.issue
  const closed = quote?.payments?.open === false ? paymentsClosed(quote.payments) : null // before launch day, or paused

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!items.length) {
      setMessage('Your cart is empty.')
      setStatus('error')
      return
    }

    const found = validateCheckout(fields)
    setTried(true)
    setErrors(found)
    const first = CHECKOUT_FIELDS.find((f) => found[f])
    if (first) {
      setMessage('')
      setStatus('idle')
      // take the customer straight to the first thing to fix
      const el = document.getElementById(first)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
      return
    }

    setStatus('loading')
    setMessage('')
    if (remember) saveCheckoutDetails({ email: email.trim(), address: shippingAddress.trim(), city: city.trim(), state: stateValue, postalCode })
    else forgetCheckoutDetails()

    const payload = {
      email: email.trim(),
      shippingAddress: shippingAddress.trim(),
      shippingCity: city.trim(),
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
      gift,
      delivery,
      termsAccepted,
      attribution: storedAttribution(),
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
                {quote?.payments?.closedFor === 'launch' ? (
                  <CheckoutCountdown />
                ) : closed ? (
                  <p className="mb-6 rounded-lg border border-final-ember/40 bg-final-ember/10 px-4 py-3 text-final-off-white" role="status">
                    {closed.message} Your cart stays saved on this device.
                  </p>
                ) : (
                  <p className="text-final-off-white/70 mb-6">Enter your delivery details, then pay securely on Flutterwave. Your order is placed once payment is confirmed. No account is required.</p>
                )}
                <p className="mb-6 flex items-start gap-2 rounded-lg border border-final-light-gray/30 bg-final-gray/60 px-4 py-3 text-sm text-final-off-white/85">
                  <FiTruck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-final-accent" />
                  <span>We only ship within {POLICY.shipsTo}, so please use a delivery address there.</span>
                </p>
                <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                  <div>
                    <label className="block text-final-off-white/80 mb-2" htmlFor="email">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      {...invalid('email', errors.email)}
                      className={fieldClass(errors.email)}
                      placeholder="you@example.com"
                    />
                    <FieldError id="email" error={errors.email} />
                  </div>

                  <div>
                    <label className="block text-final-off-white/80 mb-2" htmlFor="shippingAddress">Delivery address</label>
                    <input
                      id="shippingAddress"
                      name="address"
                      type="text"
                      autoComplete="street-address"
                      required
                      maxLength={300}
                      value={shippingAddress}
                      onChange={(event) => setShippingAddress(event.target.value)}
                      {...invalid('shippingAddress', errors.shippingAddress)}
                      className={fieldClass(errors.shippingAddress)}
                      placeholder="House number, street, nearest landmark"
                    />
                    <FieldError id="shippingAddress" error={errors.shippingAddress} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-final-off-white/80 mb-2" htmlFor="state">State</label>
                      <div className="relative">
                        <select
                          id="state"
                          name="state"
                          autoComplete="address-level1"
                          required
                          value={stateValue}
                          onChange={(event) => setStateValue(event.target.value)}
                          {...invalid('state', errors.state)}
                          className={`${fieldClass(errors.state)} appearance-none pr-10 ${stateValue ? '' : 'text-final-off-white/50'}`}
                        >
                          <option value="" disabled className="bg-final-black">Choose your state</option>
                          {NIGERIAN_STATES.map((s) => <option key={s} value={s} className="bg-final-black text-final-off-white">{s}</option>)}
                        </select>
                        <FiChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-final-muted" />
                      </div>
                      <FieldError id="state" error={errors.state} />
                    </div>
                    <div>
                      <label className="block text-final-off-white/80 mb-2" htmlFor="city">City or town</label>
                      <input
                        id="city"
                        name="city"
                        type="text"
                        autoComplete="address-level2"
                        required
                        maxLength={100}
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        {...invalid('city', errors.city)}
                        className={fieldClass(errors.city)}
                        placeholder="e.g. Ikeja, Wuse, Port Harcourt"
                      />
                      <FieldError id="city" error={errors.city} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-final-off-white/80 mb-2" htmlFor="postalCode">Postal code <span className="text-final-muted">(optional)</span></label>
                      <input
                        id="postalCode"
                        name="postalCode"
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={6}
                        value={postalCode}
                        onChange={(event) => setPostalCode(event.target.value)}
                        className={FIELD}
                        placeholder="e.g. 100001"
                      />
                    </div>
                    {/* no country box: it's always Nigeria, and the notice above the form says so */}
                  </div>

                  <label className="flex items-center gap-3 text-sm text-final-muted">
                    <input type="checkbox" checked={remember} onChange={(e) => { setRemember(e.target.checked); if (!e.target.checked) forgetCheckoutDetails() }} className="h-4 w-4 shrink-0 accent-final-ember" />
                    <span>Remember my delivery details on this device</span>
                  </label>

                  {quote?.delivery && <DeliveryChoice delivery={quote.delivery} value={delivery} onChange={setDelivery} />}

                  <div>
                  <label className="flex items-start gap-3 text-sm text-final-muted">
                    <input id="terms" type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} required {...invalid('terms', errors.terms)} className="mt-0.5 h-4 w-4 shrink-0 accent-final-ember" />
                    <span>
                      I agree to the <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-final-off-white">Terms of Sale</Link> and{' '}
                      <Link href="/returns" target="_blank" className="underline underline-offset-2 hover:text-final-off-white">Returns Policy</Link>.
                      We use your details to process your order as described in our{' '}
                      <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-final-off-white">Privacy Policy</Link>.
                    </span>
                  </label>
                  <FieldError id="terms" error={errors.terms} />
                  </div>

                  {errorCount > 0 && (
                    <p className="flex items-start gap-1.5 text-sm text-red-400" role="alert">
                      <FiAlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{errorCount === 1 ? 'One detail above needs your attention.' : `${errorCount} details above need your attention.`}</span>
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'loading' || status === 'redirecting' || !quote?.ok || pricing || !!closed}
                    className="w-full bg-final-accent text-final-black py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300 disabled:opacity-50"
                  >
                    {status === 'redirecting'
                      ? 'Taking you to Flutterwave…'
                      : status === 'loading'
                        ? 'Starting payment…'
                        : closed
                          ? closed.label
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
                    <span>{quote?.gift?.issue ?? 'Some items in your cart can’t be bought right now.'} <Link href="/cart" className="underline underline-offset-2">Review your cart</Link></span>
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
                          {line?.madeToOrderDays && <p className="text-sm text-final-ember">Ships about {line.madeToOrderDays} days after payment</p>}
                          {line?.issue && <p className="text-sm text-red-400">{line.issue}</p>}
                        </div>
                        <p className="shrink-0 text-final-accent font-bold">{formatCurrency(line ? Number(line.lineTotal) : item.price * item.quantity)}</p>
                      </div>
                    )
                  })}
                  {quote?.gift?.line ? (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-final-off-white">{quote.gift.line.name}</p>
                        <p className="text-final-off-white/70 text-sm">{['Free gift', quote.gift.line.color].filter(Boolean).join(' • ')}</p>
                      </div>
                      <p className="shrink-0 text-final-accent font-bold">Free</p>
                    </div>
                  ) : quote?.gift?.eligible && quote.gift.options.some((o) => o.available) && (
                    <p className="rounded-lg border border-final-accent/40 px-3 py-2 text-sm text-final-off-white/80">
                      Your order comes with a free gift. <Link href="/cart" className="underline underline-offset-2 hover:text-final-off-white">Pick it in your cart</Link>
                    </p>
                  )}
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
                    <span>{quote?.delivery.option === 'express' ? 'Express delivery' : 'Delivery'}</span>
                    <span>{quote && Number(quote.delivery.fee) > 0 ? formatCurrency(quote.delivery.fee) : 'Free'}</span>
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
