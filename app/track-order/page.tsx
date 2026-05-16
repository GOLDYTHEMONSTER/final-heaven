'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiSearch, FiPackage, FiTruck, FiCheckCircle, FiClock, FiMapPin } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'

// Mock order data
const mockOrders = {
  'FH123456': {
    id: 'FH123456',
    email: 'alex@example.com',
    status: 'shipped',
    items: [
      { name: 'Neon Dreams Hoodie', quantity: 1, price: 89.99 },
      { name: 'Cyberpunk Tee', quantity: 2, price: 49.99 }
    ],
    total: 189.97,
    orderDate: '2024-01-15',
    estimatedDelivery: '2024-01-20',
    trackingNumber: '1Z999AA1234567890',
    shippingAddress: '123 Street Name, City, State 12345',
    timeline: [
      { status: 'ordered', date: '2024-01-15', time: '14:30', description: 'Order placed' },
      { status: 'processing', date: '2024-01-16', time: '09:15', description: 'Order confirmed and processing' },
      { status: 'shipped', date: '2024-01-17', time: '16:45', description: 'Package shipped via Express' },
      { status: 'delivered', date: '2024-01-20', time: '11:20', description: 'Package delivered' }
    ]
  }
}

const statusConfig = {
  ordered: { color: 'text-blue-400', bg: 'bg-blue-400/20', icon: FiClock },
  processing: { color: 'text-yellow-400', bg: 'bg-yellow-400/20', icon: FiPackage },
  shipped: { color: 'text-purple-400', bg: 'bg-purple-400/20', icon: FiTruck },
  delivered: { color: 'text-green-400', bg: 'bg-green-400/20', icon: FiCheckCircle }
}

export default function TrackOrderPage() {
  const [searchType, setSearchType] = useState<'orderId' | 'email'>('orderId')
  const [searchValue, setSearchValue] = useState('')
  const [order, setOrder] = useState<any>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSearch = async () => {
    if (!searchValue.trim()) return

    setIsSearching(true)
    setErrorMessage('')
    setOrder(null)

    const params = new URLSearchParams({
      type: searchType,
      value: searchValue.trim(),
    })

    const response = await fetch(`/api/orders?${params.toString()}`)
    const data = await response.json()

    if (!response.ok) {
      setErrorMessage(data?.error || 'Order not found.')
      setIsSearching(false)
      return
    }

    setOrder(data.order)
    setIsSearching(false)
  }

  const getStatusIcon = (status: string) => {
    const config = statusConfig[status as keyof typeof statusConfig]
    const Icon = config.icon
    return <Icon className={`w-5 h-5 ${config.color}`} />
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-final-off-white mb-4">
              <span className="gradient-text">TRACK</span> YOUR ORDER
            </h1>
            <p className="text-xl text-final-off-white/70 max-w-2xl mx-auto">
              Enter your order ID or email address to track your Final Heaven order status and delivery.
            </p>
          </motion.div>

          {/* Search Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30 mb-12"
          >
            <div className="flex flex-col lg:flex-row gap-4 items-center">
              {/* Search Type Toggle */}
              <div className="flex bg-final-gray rounded-lg p-1">
                <button
                  onClick={() => setSearchType('orderId')}
                  className={`px-4 py-2 rounded-md transition-all duration-300 ${
                    searchType === 'orderId'
                      ? 'bg-final-accent text-final-black'
                      : 'text-final-off-white hover:text-final-accent'
                  }`}
                >
                  Order ID
                </button>
                <button
                  onClick={() => setSearchType('email')}
                  className={`px-4 py-2 rounded-md transition-all duration-300 ${
                    searchType === 'email'
                      ? 'bg-final-accent text-final-black'
                      : 'text-final-off-white hover:text-final-accent'
                  }`}
                >
                  Email
                </button>
              </div>

              {/* Search Input */}
              <div className="relative flex-1 max-w-md">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-final-off-white/50 w-5 h-5" />
                <input
                  type={searchType === 'email' ? 'email' : 'text'}
                  placeholder={searchType === 'orderId' ? 'Enter Order ID (e.g., FH123456)' : 'Enter your email'}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-final-gray border border-final-light-gray/30 rounded-lg text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent transition-colors"
                />
              </div>

              {/* Search Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSearch}
                disabled={isSearching}
                className="bg-final-accent text-final-black px-8 py-3 rounded-lg font-bold hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300 disabled:opacity-50"
              >
                {isSearching ? 'Searching...' : 'Track Order'}
              </motion.button>
            </div>
          </motion.div>

          {/* Order Details */}
          {order && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
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
                    <p className="text-lg font-bold text-final-accent">${order.total}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-final-off-white/70 mb-1">Status</h3>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(order.status)}
                      <span className="text-lg font-bold text-final-off-white capitalize">{order.status}</span>
                    </div>
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
                        <p className="text-final-off-white/70">Quantity: {item.quantity}</p>
                      </div>
                      <span className="text-lg font-bold text-final-accent">${item.price}</span>
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
                      <span>Shipping Address</span>
                    </h4>
                    <p className="text-final-off-white/70">{order.shipping_address}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-final-off-white mb-2">Tracking Number</h4>
                    <p className="text-final-accent font-mono">{order.tracking_number}</p>
                    <p className="text-final-off-white/70 text-sm mt-1">
                      Estimated Delivery: TBD
                    </p>
                  </div>
                </div>
              </div>

              {/* Order Timeline */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
                <h3 className="text-xl font-bold text-final-off-white mb-6">Order Timeline</h3>
                <div className="space-y-6">
                  {order.timeline.map((event: any, index: number) => (
                    <div key={index} className="flex items-start space-x-4">
                      <div className={`p-3 rounded-full ${statusConfig[event.status as keyof typeof statusConfig].bg}`}>
                        {getStatusIcon(event.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-final-off-white capitalize">{event.status}</h4>
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
          {searchValue && !order && !isSearching && (
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
                We couldn't find an order with the provided {searchType === 'orderId' ? 'Order ID' : 'email'}.
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