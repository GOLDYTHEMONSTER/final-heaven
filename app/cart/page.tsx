'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { sized } from '@/lib/images'
import Link from 'next/link'
import { FiTrash2, FiArrowLeft, FiLock, FiAlertCircle } from 'react-icons/fi'
import { formatCurrency } from '@/lib/utils/format'
import { useCart } from '@/components/providers/CartProvider'
import { Layout } from '@/components/layout/Layout'
import { lineKey } from '@/lib/stores/cartStore'
import { formatDay, optionLabel, paymentsClosed } from '@/lib/catalog'
import { quoteLineAt, useQuote } from '@/lib/useQuote'
import { GiftPicker } from '@/components/cart/GiftPicker'

const formatDate = (d: string) => formatDay(d, { day: 'numeric', month: 'short', year: 'numeric' })

export default function CartPage() {
  const { items, removeItem, updateQuantity, total, clearCart, promoCode, setPromoCode, gift, setGift } = useCart()
  const [promoInput, setPromoInput] = useState(promoCode)
  useEffect(() => setPromoInput(promoCode), [promoCode])
  // Prices, discount, availability and the free gift come from the server: exactly what checkout will charge.
  const { quote, loading, error: quoteError } = useQuote(items, promoCode, undefined, gift)
  const subtotal = quote ? Number(quote.subtotal) : total
  const discount = quote ? Number(quote.discount) : 0
  const finalTotal = quote ? Number(quote.total) : total
  const lineIssues = (quote?.lines?.some((l) => l.issue) ?? false) || !!quote?.gift?.issue
  const closed = quote?.payments?.open === false ? paymentsClosed(quote.payments) : null // before launch day, or paused
  const canCheckout = !!quote && !lineIssues && !loading && !closed

  if (items.length === 0) {
    return (
      <Layout>
        <div className="min-h-screen bg-final-black pt-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div className="text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8 }}
                className="mb-8"
              >
                <div className="w-24 h-24 bg-final-dark-gray rounded-full flex items-center justify-center mx-auto mb-4">
                  <FiLock className="w-12 h-12 text-final-accent" />
                </div>
                <h1 className="display text-4xl text-final-off-white mb-4">Your cart is empty</h1>
                <p className="text-xl text-final-off-white/70 mb-8">
                  Looks like you haven&apos;t added anything to your cart yet.
                </p>
              </motion.div>
              
              <Link href="/shop">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-final-accent text-final-black px-8 py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                >
                  START SHOPPING
                </motion.button>
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-final-black pt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Cart Items */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-8">
                <h1 className="display text-3xl md:text-4xl text-final-off-white">Shopping Cart</h1>
                <button
                  onClick={clearCart}
                  className="text-final-off-white/70 hover:text-final-accent transition-colors"
                >
                  Clear All
                </button>
              </div>

              <div className="space-y-6">
                <AnimatePresence>
                  {items.map((item, index) => {
                    const line = quoteLineAt(quote, items, index)
                    const key = lineKey(item)
                    const size = line ? line.size : item.size
                    const color = line ? line.color : item.color
                    return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 50 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className="bg-final-dark-gray/50 backdrop-blur-sm rounded-lg p-6 border border-final-light-gray/30"
                    >
                      {/* Phones: photo and details, with quantity and remove on their own line beneath. */}
                      <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
                        {/* Product Image */}
                        <div className="relative w-24 h-32 bg-final-gray rounded-lg overflow-hidden flex-shrink-0">
                          <Image
                            src={sized(item.image || '/api/placeholder/400/500', 640)}
                            alt={item.name}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                          {item.isMembersOnly && (
                            <div className="absolute top-1 left-1">
                              <span className="bg-final-accent text-final-black text-xs font-bold px-1 py-0.5 rounded">
                                M
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="min-w-0 flex-1 basis-[calc(100%-7rem)] sm:basis-auto">
                          <h3 className="text-lg font-semibold text-final-off-white mb-1">{item.name}</h3>
                          <p className="text-final-off-white/70 mb-2">
                            {[size ? `Size ${size}` : null, color ? optionLabel(color) : null].filter(Boolean).join(' · ')}
                          </p>
                          <p className="text-xl font-bold text-final-accent">{formatCurrency(line ? Number(line.unitPrice) : item.price)}</p>
                          {line?.preorder && line.shipsOn && (
                            <p className="mt-1 text-sm text-final-ember">Pre-order · ships from {formatDate(line.shipsOn)}</p>
                          )}
                          {line?.madeToOrderDays && (
                            <p className="mt-1 text-sm text-final-ember">Made to order · ships about {line.madeToOrderDays} days after payment</p>
                          )}
                          {line?.issue && (
                            <p className="mt-2 flex items-start gap-1.5 text-sm text-red-400" role="alert">
                              <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              <span>{line.issue} <Link href={`/product/${item.id}`} className="underline underline-offset-2">View item</Link></span>
                            </p>
                          )}
                        </div>

                        <div className="flex w-full items-center justify-between pl-28 sm:w-auto sm:justify-start sm:gap-4 sm:pl-0">
                        {/* Quantity Controls */}
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => updateQuantity(key, item.quantity - 1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="w-8 h-8 bg-final-gray border border-final-light-gray rounded text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors"
                          >
                            -
                          </button>
                          <span className="text-lg font-semibold text-final-off-white min-w-[2rem] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(key, item.quantity + 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="w-8 h-8 bg-final-gray border border-final-light-gray rounded text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors"
                          >
                            +
                          </button>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeItem(key)}
                          aria-label={`Remove ${item.name}`}
                          className="p-2 text-final-off-white/70 hover:text-red-400 transition-colors"
                        >
                          <FiTrash2 className="w-5 h-5" />
                        </button>
                        </div>
                      </div>
                    </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>

              {quote?.gift && <GiftPicker offer={quote.gift} subtotal={subtotal} gift={gift} setGift={setGift} />}

              {/* Continue Shopping */}
              <div className="mt-8">
                <Link href="/shop">
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center space-x-2 text-final-off-white hover:text-final-accent transition-colors cursor-pointer"
                  >
                    <FiArrowLeft className="w-5 h-5" />
                    <span>Continue Shopping</span>
                  </motion.div>
                </Link>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-lg p-6 border border-final-light-gray/30 sticky top-24">
                <h2 className="text-2xl font-bold text-final-off-white mb-6">Order Summary</h2>

                {/* Promo Code: checked and applied by the server */}
                <form className="mb-6" onSubmit={(e) => { e.preventDefault(); setPromoCode(promoInput) }}>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Promo code"
                      aria-label="Promo code"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      maxLength={30}
                      autoCapitalize="characters"
                      className="min-w-0 flex-1 px-4 py-3 bg-final-gray border border-final-light-gray/30 rounded-lg text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent transition-colors"
                    />
                    {promoCode ? (
                      <button type="button" onClick={() => setPromoCode('')} className="px-4 py-3 border border-final-light-gray/30 text-final-off-white rounded-lg font-semibold">
                        Remove
                      </button>
                    ) : (
                      <button type="submit" disabled={!promoInput.trim()} className="px-4 py-3 bg-final-accent text-final-black rounded-lg font-semibold transition-all duration-300 disabled:opacity-50">
                        Apply
                      </button>
                    )}
                  </div>
                  {promoCode && quote?.promo && <p className="mt-2 text-sm text-green-400">{quote.promo.code} applied{quote.promo.description ? ` · ${quote.promo.description}` : ''}</p>}
                  {promoCode && quote?.promoError && <p className="mt-2 text-sm text-red-400" role="alert">{quote.promoError}</p>}
                </form>

                {/* Summary Details */}
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-final-off-white/70">
                    <span>Subtotal ({items.reduce((sum, item) => sum + item.quantity, 0)} items)</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-final-accent">
                      <span>Discount{quote?.promo ? ` (${quote.promo.code})` : ''}</span>
                      <span>-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  {quote?.gift?.line && (
                    <div className="flex justify-between gap-3 text-final-off-white/70">
                      <span>Gift: {quote.gift.line.name}{quote.gift.line.color ? ` (${quote.gift.line.color})` : ''}</span>
                      <span className="shrink-0 text-final-accent">Free</span>
                    </div>
                  )}
                  <div className="flex justify-between text-final-off-white/70">
                    <span>Shipping</span>
                    <span>Free</span>
                  </div>
                  <div className="border-t border-final-light-gray/30 pt-4">
                    <div className="flex justify-between text-xl font-bold text-final-off-white">
                      <span>Total</span>
                      <span>{formatCurrency(finalTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Checkout Button */}
                {canCheckout ? (
                  <Link
                    href="/checkout"
                    className="block text-center w-full bg-final-accent text-final-black py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                  >
                    PROCEED TO CHECKOUT
                  </Link>
                ) : (
                  <button type="button" disabled className="block w-full rounded-lg bg-final-accent py-4 text-center text-lg font-bold text-final-black opacity-50">
                    {lineIssues ? 'FIX YOUR CART TO CONTINUE' : closed ? closed.label.toUpperCase() : quoteError ? 'CHECKOUT UNAVAILABLE' : 'CHECKING PRICES…'}
                  </button>
                )}

                {closed && !lineIssues && (
                  <p className="mt-3 text-center text-sm text-final-muted">{closed.message} Your cart stays saved on this device.</p>
                )}

                {quoteError && !loading && (
                  <p role="alert" className="mt-3 text-center text-sm text-red-400">We couldn’t check prices right now. Please refresh in a moment.</p>
                )}

                {/* Security Notice */}
                <p className="text-sm text-final-off-white/50 text-center mt-4">
                  <FiLock className="inline w-4 h-4 mr-1" />
                  Secure payment with Flutterwave
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
} 