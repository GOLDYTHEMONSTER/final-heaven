'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { FiSearch, FiPackage, FiTruck, FiCheckCircle, FiClock, FiMapPin, FiRefreshCw, FiX, FiCreditCard } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { formatCurrency } from '@/lib/utils/format'
import { formatDay, optionLabel } from '@/lib/catalog'

// Fulfilment status (separate from payment status). 'ordered' is the legacy
// name for pending_payment and still appears in older order timelines.
const statusConfig = {
  pending_payment: { label: 'Awaiting payment', color: 'text-blue-400', bg: 'bg-blue-400/20', icon: FiClock },
  ordered: { label: 'Order placed', color: 'text-blue-400', bg: 'bg-blue-400/20', icon: FiClock },
  confirmed: { label: 'Confirmed', color: 'text-blue-400', bg: 'bg-blue-400/20', icon: FiCreditCard },
  processing: { label: 'Processing', color: 'text-yellow-400', bg: 'bg-yellow-400/20', icon: FiPackage },
  shipped: { label: 'Shipped', color: 'text-purple-400', bg: 'bg-purple-400/20', icon: FiTruck },
  delivered: { label: 'Delivered', color: 'text-green-400', bg: 'bg-green-400/20', icon: FiCheckCircle },
  cancelled: { label: 'Cancelled', color: 'text-final-muted', bg: 'bg-final-off-white/10', icon: FiX },
}
const cfg = (status: string) => statusConfig[status as keyof typeof statusConfig] ?? statusConfig.pending_payment
const STEPS = ['confirmed', 'processing', 'shipped', 'delivered']
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Not paid yet', pending: 'Processing', paid: 'Paid', failed: 'Payment failed',
  partially_refunded: 'Partially refunded', refunded: 'Refunded', unverified: 'Paid (recorded)',
}

function TrackOrderContent() {
  const searchParams = useSearchParams()
  const [reference, setReference] = useState('')
  const [email, setEmail] = useState('')
  const [order, setOrder] = useState<any>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Checkout links here with ?orderNumber=; the customer still confirms their email.
  useEffect(() => {
    const orderNumber = searchParams.get('orderNumber')
    if (orderNumber) setReference(orderNumber)
  }, [searchParams])

  const lookup = async () => {
    const params = new URLSearchParams({ reference: reference.trim(), email: email.trim() })
    const response = await fetch(`/api/orders?${params.toString()}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, data }
  }

  const handleSearch = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!reference.trim() || !email.trim()) {
      setErrorMessage('Enter both your order number and the email you ordered with.')
      return
    }

    setIsSearching(true)
    setErrorMessage('')
    setOrder(null)
    try {
      const { ok, data } = await lookup()
      if (ok) setOrder(data.order)
      else setErrorMessage(data?.error || 'We couldn’t find an order matching those details.')
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleRefresh = async () => {
    if (!order) return
    setIsRefreshing(true)
    try {
      const { ok, data } = await lookup()
      if (ok) setOrder(data.order)
    } finally {
      setIsRefreshing(false)
    }
  }

  const getStatusIcon = (status: string) => {
    const config = cfg(status)
    const Icon = config.icon
    return <Icon className={`w-5 h-5 ${config.color}`} />
  }

  const getStatusProgress = (status: string) => {
    return Math.max(0, STEPS.indexOf(status) + 1) / STEPS.length * 100
  }

  const inputClass =
    'w-full rounded-lg border border-final-off-white/15 bg-final-black px-4 py-3 text-final-off-white placeholder:text-final-muted transition-colors focus:border-final-off-white/60 focus:outline-none'

  return (
    <Layout>
      <div className="min-h-screen bg-final-black pt-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            <h1 className="display text-4xl md:text-6xl text-final-off-white mb-4">
              <span className="heading-muted">TRACK</span> YOUR ORDER
            </h1>
            <p className="text-lg text-final-muted max-w-2xl mx-auto">
              Enter your order number and the email you ordered with.
            </p>
          </motion.div>

          {/* Search Section */}
          <motion.form
            onSubmit={handleSearch}
            noValidate
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mb-12 rounded-xl border border-final-off-white/10 bg-final-gray p-6 md:p-8"
          >
            <div className="grid gap-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div>
                <label htmlFor="track-reference" className="mb-2 block text-sm font-medium text-final-off-white/80">
                  Order or tracking number
                </label>
                <input
                  id="track-reference"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="FH-7K2Q9XWMRA"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={`${inputClass} font-mono uppercase`}
                />
              </div>
              <div>
                <label htmlFor="track-email" className="mb-2 block text-sm font-medium text-final-off-white/80">
                  Email address
                </label>
                <input
                  id="track-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={isSearching} className="btn-primary disabled:opacity-60">
                <FiSearch className="h-4 w-4" />
                {isSearching ? 'Searching' : 'Track order'}
              </button>
            </div>
          </motion.form>

          {/* Order Details */}
          {order && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              {/* Refresh Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 px-4 py-2 bg-final-accent/20 text-final-accent rounded-lg hover:bg-final-accent/30 transition-colors disabled:opacity-50"
                >
                  <FiRefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
                </button>
              </div>

              {/* Status Progress Bar */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <h3 className="text-sm font-semibold text-final-off-white/70 mb-4">Delivery Progress</h3>
                <div className="w-full bg-final-gray rounded-full h-2 mb-6 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${getStatusProgress(order.status)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-final-accent to-yellow-400"
                  />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {STEPS.map((status) => (
                    <div key={status} className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                        STEPS.indexOf(status) <= STEPS.indexOf(order.status)
                          ? cfg(status).bg
                          : 'bg-final-gray'
                      }`}>
                        {getStatusIcon(status)}
                      </div>
                      <span className="text-xs text-final-off-white/70">{cfg(status).label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          <div>
                    <h3 className="text-sm font-semibold text-final-off-white/70 mb-1">Order ID</h3>
                    <p className="text-lg font-bold text-final-off-white">{order.order_number}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-final-off-white/70 mb-1">Order Date</h3>
                    <p className="text-lg font-bold text-final-off-white">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-final-off-white/70 mb-1">Total</h3>
                    <p className="text-lg font-bold text-final-accent">{formatCurrency(order.total)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-final-off-white/70 mb-1">Status</h3>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(order.status)}
                      <span className="text-lg font-bold text-final-off-white">{cfg(order.status).label}</span>
                    </div>
                    <p className="mt-1 text-sm text-final-muted">Payment: {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}</p>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <h3 className="text-xl font-bold text-final-off-white mb-6">Order Items</h3>
                <div className="space-y-4">
                  {order.order_items.map((item: any, index: number) => (
                    <div key={index} className="flex items-center justify-between py-4 border-b border-final-light-gray/20 last:border-b-0">
                      <div>
                        <h4 className="font-semibold text-final-off-white">{item.name}</h4>
                        <p className="text-final-off-white/70">
                          {[`Quantity: ${item.quantity}`, item.size ? `Size ${item.size}` : null, item.color ? optionLabel(item.color) : null].filter(Boolean).join(' · ')}
                        </p>
                        {item.preorder && item.shipsOn && <p className="text-sm text-final-ember">Pre-order · ships from {formatDay(item.shipsOn)}</p>}
                      </div>
                      <span className="text-lg font-bold text-final-accent">{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shipping Information */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <h3 className="text-xl font-bold text-final-off-white mb-6">Shipping Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-final-off-white mb-2 flex items-center space-x-2">
                      <FiMapPin className="w-5 h-5 text-final-accent" />
                      <span>Shipping to</span>
                    </h4>
                    <p className="text-final-off-white/70">{[order.shipping_city, order.shipping_country].filter(Boolean).join(', ') || 'On file'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-final-off-white mb-2">Courier tracking</h4>
                    {order.shipping_reference ? (
                      <>
                        <p className="text-final-off-white">{order.shipping_carrier || 'Courier'}</p>
                        <p className="font-mono text-final-off-white/80">{order.shipping_reference}</p>
                        <p className="mt-1 text-sm text-final-muted">Use this reference on the courier’s website for live updates.</p>
                      </>
                    ) : (
                      <p className="text-sm text-final-muted">Added here once your order ships.</p>
                    )}
                    <p className="mt-3 text-xs text-final-muted">Our reference: <span className="font-mono">{order.tracking_number}</span></p>
                  </div>
                </div>
              </div>

              {/* Order Timeline */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <h3 className="text-xl font-bold text-final-off-white mb-6">Order Timeline</h3>
                <div className="space-y-6">
                  {order.timeline.map((event: any, index: number) => (
                    <div key={index} className="flex items-start space-x-4">
                      <div className={`p-3 rounded-full ${cfg(event.status).bg}`}>
                        {getStatusIcon(event.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-final-off-white">{cfg(event.status).label}</h4>
                          <span className="text-final-off-white/70 text-sm">
                            {new Date(event.date).toLocaleDateString()} at {event.time}
                          </span>
                        </div>
                        <p className="text-final-off-white/70">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* No Order Found */}
          {errorMessage && !order && !isSearching && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <div className="w-16 h-16 bg-final-dark-gray rounded-full flex items-center justify-center mx-auto mb-4">
                <FiPackage className="w-8 h-8 text-final-accent" />
              </div>
              <h3 className="text-2xl font-semibold text-final-off-white mb-2">Order not found</h3>
              <p className="text-final-off-white/70 mb-4">
                {errorMessage}
              </p>
              <p className="text-final-off-white/50 text-sm">
                Please check your information and try again, or contact support if you need assistance.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </Layout>
  )
}

// useSearchParams needs a Suspense boundary for the page to prerender.
export default function TrackOrderPage() {
  return (
    <Suspense>
      <TrackOrderContent />
    </Suspense>
  )
}
