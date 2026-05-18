'use client'

import { useEffect, useState } from 'react'
import { Layout } from '@/components/layout/Layout'
import { FiEdit, FiRefreshCw } from 'react-icons/fi'

const STATUS_OPTIONS = ['ordered', 'processing', 'shipped', 'delivered', 'cancelled']

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => { fetchOrders() }, [])

  async function fetchOrders() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/orders')
      const data = await res.json()
      setOrders(data.orders || [])
    } catch (err) {
      console.error('Failed to fetch orders', err)
    } finally { setLoading(false) }
  }

  async function updateStatus(orderNumber: string, status: string) {
    try {
      setUpdating(true)
      const res = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, status })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Update failed')
      setOrders(prev => prev.map(o => o.order_number === data.order.order_number ? data.order : o))
    } catch (err) {
      alert('Failed to update order status')
      console.error(err)
    } finally { setUpdating(false) }
  }

  return (
    <Layout>
      <div className="min-h-screen pt-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray">
        <div className="max-w-7xl mx-auto py-12">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-final-off-white">Orders</h1>
            <div className="flex items-center gap-2">
              <button onClick={fetchOrders} className="px-4 py-2 bg-final-gray rounded-md text-final-off-white flex items-center gap-2"><FiRefreshCw/> Refresh</button>
            </div>
          </div>

          <div className="space-y-4">
            {loading && <p className="text-final-off-white">Loading orders…</p>}
            {!loading && orders.length === 0 && <p className="text-final-off-white/70">No orders found.</p>}

            {orders.map((order) => (
              <div key={order.order_number} className="bg-final-dark-gray/50 border border-final-light-gray/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-final-off-white">{order.order_number} — {order.email}</p>
                  <p className="text-sm text-final-off-white/70">Total: ${order.total} • {new Date(order.created_at).toLocaleString()}</p>
                </div>

                <div className="mt-4 md:mt-0 flex items-center gap-3">
                  <select defaultValue={order.status} onChange={(e) => updateStatus(order.order_number, e.target.value)} disabled={updating} className="bg-final-gray text-final-off-white px-3 py-2 rounded-md">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button disabled={updating} onClick={() => updateStatus(order.order_number, order.status)} className="px-3 py-2 bg-final-accent text-final-black rounded-md">Save</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}
