'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { FiTrash2, FiArrowLeft, FiLock } from 'react-icons/fi'
import { useCart } from '@/components/providers/CartProvider'
import { Layout } from '@/components/layout/Layout'

export default function CartPage() {
  const { items, removeItem, updateQuantity, total, clearCart } = useCart()
  const [promoCode, setPromoCode] = useState('')
  const [discount, setDiscount] = useState(0)

  const handlePromoCode = () => {
    // Mock promo code logic
    if (promoCode.toLowerCase() === 'final10') {
      setDiscount(total * 0.1)
    } else {
      alert('Invalid promo code')
    }
  }

  const finalTotal = total - discount

  if (items.length === 0) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
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
                <h1 className="text-4xl font-bold text-final-off-white mb-4">Your cart is empty</h1>
                <p className="text-xl text-final-off-white/70 mb-8">
                  Looks like you haven't added anything to your cart yet.
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
      <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Cart Items */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-final-off-white">Shopping Cart</h1>
                <button
                  onClick={clearCart}
                  className="text-final-off-white/70 hover:text-final-accent transition-colors"
                >
                  Clear All
                </button>
              </div>

              <div className="space-y-6">
                <AnimatePresence>
                  {items.map((item, index) => (
                    <motion.div
                      key={`${item.id}-${item.size}`}
                      initial={{ opacity: 0, x: -50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 50 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className="bg-final-dark-gray/50 backdrop-blur-sm rounded-lg p-6 border border-final-light-gray/30"
                    >
                      <div className="flex items-center space-x-4">
                        {/* Product Image */}
                        <div className="relative w-24 h-32 bg-final-gray rounded-lg overflow-hidden flex-shrink-0">
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
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
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-final-off-white mb-1">{item.name}</h3>
                          <p className="text-final-off-white/70 mb-2">Size: {item.size}</p>
                          <p className="text-xl font-bold text-final-accent">${item.price}</p>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            className="w-8 h-8 bg-final-gray border border-final-light-gray rounded text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors"
                          >
                            -
                          </button>
                          <span className="text-lg font-semibold text-final-off-white min-w-[2rem] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 bg-final-gray border border-final-light-gray rounded text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors"
                          >
                            +
                          </button>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-2 text-final-off-white/70 hover:text-red-400 transition-colors"
                        >
                          <FiTrash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Continue Shopping */}
              <div className="mt-8">
                <Link href="/shop">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center space-x-2 text-final-off-white hover:text-final-accent transition-colors"
                  >
                    <FiArrowLeft className="w-5 h-5" />
                    <span>Continue Shopping</span>
                  </motion.button>
                </Link>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-lg p-6 border border-final-light-gray/30 sticky top-24">
                <h2 className="text-2xl font-bold text-final-off-white mb-6">Order Summary</h2>

                {/* Promo Code */}
                <div className="mb-6">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Promo code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      className="flex-1 px-4 py-3 bg-final-gray border border-final-light-gray/30 rounded-lg text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent transition-colors"
                    />
                    <button
                      onClick={handlePromoCode}
                      className="px-4 py-3 bg-final-accent text-final-black rounded-lg font-semibold hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {/* Summary Details */}
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-final-off-white/70">
                    <span>Subtotal ({items.reduce((sum, item) => sum + item.quantity, 0)} items)</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-final-accent">
                      <span>Discount</span>
                      <span>-${discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-final-off-white/70">
                    <span>Shipping</span>
                    <span>Free</span>
                  </div>
                  <div className="border-t border-final-light-gray/30 pt-4">
                    <div className="flex justify-between text-xl font-bold text-final-off-white">
                      <span>Total</span>
                      <span>${finalTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Checkout Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-final-accent text-final-black py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                >
                  PROCEED TO CHECKOUT
                </motion.button>

                {/* Security Notice */}
                <p className="text-sm text-final-off-white/50 text-center mt-4">
                  <FiLock className="inline w-4 h-4 mr-1" />
                  Secure checkout powered by Stripe
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
} 