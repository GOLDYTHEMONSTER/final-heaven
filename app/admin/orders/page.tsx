'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FiEdit, FiRefreshCw, FiPackage, FiShoppingBag, FiActivity, FiChevronDown } from 'react-icons/fi'

const STATUS_OPTIONS = ['ordered', 'processing', 'shipped', 'delivered', 'cancelled']
const STATUS_COLORS = {
  ordered: 'bg-blue-500/20 text-blue-400',
  processing: 'bg-yellow-500/20 text-yellow-400',
  shipped: 'bg-purple-500/20 text-purple-400',
  delivered: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    fetchOrders()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchOrders, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  async function fetchOrders() {
    try {
      setFetchError('')
      const res = await fetch('/api/admin/orders')
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error || 'Unable to fetch orders'
        console.error('Failed to fetch orders', message)
        setFetchError(message)
        setOrders([])
        return
      }
      setOrders(data.orders || [])
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Failed to fetch orders', err)
      setFetchError('Unable to fetch orders. See console for details.')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(orderNumber: string, status: string) {
    try {
      setUpdating(orderNumber)
      const res = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, status })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Update failed')
      setOrders(prev => prev.map(o => o.order_number === data.order.order_number ? data.order : o))
      setLastUpdated(new Date())
    } catch (err) {
      alert('Failed to update order status')
      console.error(err)
    } finally {
      setUpdating(null)
    }
  }

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-7xl mx-auto py-12">

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="display text-3xl md:text-4xl text-final-off-white">Orders</h1>
              {lastUpdated && (
                <p className="text-sm text-final-off-white/60 mt-1">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-final-off-white text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 accent-final-accent"
                />
                Auto-refresh
              </label>
              <button
                onClick={fetchOrders}
                disabled={loading}
                className="px-4 py-2 bg-final-gray rounded-md text-final-off-white flex items-center gap-2 hover:bg-final-accent hover:text-final-black transition-colors disabled:opacity-50"
              >
                <FiRefreshCw className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {fetchError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 mb-6">
              <p className="font-semibold">Unable to load orders</p>
              <p>{fetchError}</p>
            </div>
          )}

          <div className="space-y-4">
            {loading && <p className="text-final-off-white">Loading orders…</p>}
            {!loading && orders.length === 0 && <p className="text-final-off-white/70">No orders found.</p>}

            {orders.map((order) => (
              <div key={order.order_number} className="bg-final-dark-gray/50 border border-final-light-gray/30 rounded-xl overflow-hidden">
                {/* Main Order Row */}
                <div className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-final-off-white">{order.order_number}</p>
                    <p className="text-sm text-final-off-white/70">{order.email}</p>
                    <p className="text-sm text-final-off-white/70 mt-1">
                      Total: <span className="text-final-accent font-semibold">${order.total}</span> • {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={order.status}
                      onChange={(e) => updateStatus(order.order_number, e.target.value)}
                      disabled={updating === order.order_number}
                      className={`px-3 py-2 rounded-md text-sm font-semibold cursor-pointer disabled:opacity-50 ${STATUS_COLORS[order.status as keyof typeof STATUS_COLORS] || 'bg-final-gray text-final-off-white'}`}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s} className="bg-final-dark-gray">{s}</option>)}
                    </select>
                    <button
                      onClick={() => setExpandedOrder(expandedOrder === order.order_number ? null : order.order_number)}
                      className="p-2 hover:bg-final-gray rounded-md transition-colors"
                    >
                      <FiChevronDown
                        className={`w-5 h-5 text-final-off-white transition-transform ${
                          expandedOrder === order.order_number ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedOrder === order.order_number && (
                  <div className="border-t border-final-light-gray/20 p-4 space-y-4 bg-final-dark-gray/30">
                    {/* Order Items */}
                    <div>
                      <h4 className="font-semibold text-final-off-white mb-2">Order Items</h4>
                      <div className="space-y-2 text-sm">
                        {Array.isArray(order.order_items) && order.order_items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-final-off-white/70">
                            <span>{item.name} x{item.quantity}</span>
                            <span>${item.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Shipping Info */}
                    <div>
                      <h4 className="font-semibold text-final-off-white mb-2">Shipping</h4>
                      <div className="text-sm text-final-off-white/70 space-y-1">
                        <p>{order.shipping_address}</p>
                        {order.shipping_city && <p>{order.shipping_city}, {order.shipping_state} {order.shipping_postal_code}</p>}
                        <p className="text-final-accent font-mono mt-2">TRK: {order.tracking_number}</p>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div>
                      <h4 className="font-semibold text-final-off-white mb-2">Timeline</h4>
                      <div className="space-y-2 text-xs">
                        {Array.isArray(order.timeline) && order.timeline.map((event: any, idx: number) => (
                          <div key={idx} className="flex gap-2 text-final-off-white/70">
                            <span className="font-semibold text-final-accent min-w-fit">{event.date} {event.time}</span>
                            <span className="capitalize">{event.status}: {event.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
