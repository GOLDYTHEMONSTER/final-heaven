'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FiChevronDown, FiRefreshCw, FiSearch } from 'react-icons/fi'
import { formatCurrency } from '@/lib/utils/format'
import { useLiveReload } from '@/components/admin/activity'
import { TrendStrip } from '@/components/admin/Trends'

type Transition = { from_status: string; to_status: string; requires_payment: boolean }
type Order = Record<string, any>

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Unpaid', pending: 'Processing', paid: 'Paid', failed: 'Failed',
  partially_refunded: 'Part refunded', refunded: 'Refunded', unverified: 'Unverified',
}
// Payment state uses the one accent for "needs attention"; everything else stays neutral.
const PAYMENT_TONE: Record<string, string> = {
  paid: 'border-final-off-white/30 text-final-off-white',
  unpaid: 'border-final-ember/50 text-final-ember',
  failed: 'border-final-ember/50 text-final-ember',
  unverified: 'border-final-ember/50 text-final-ember',
}
const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'payment_link', label: 'Payment link' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]

function RecordPayment({ order, onDone }: { order: Order; onDone: (message: string) => void }) {
  const [amount, setAmount] = useState(String(order.total))
  const [method, setMethod] = useState('bank_transfer')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/orders/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: order.order_number, amount, method, note }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(data?.error || 'Could not record the payment.')
    onDone(`Payment recorded for ${order.order_number}.`)
  }

  const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm focus:border-final-off-white/60 focus:outline-none'
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-final-off-white/10 p-4">
      <p className="text-sm font-semibold">Record an offline payment</p>
      <p className="text-xs text-final-muted">For bank transfers or other payments received outside online checkout. The amount must equal the order total. This is logged with your name.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-final-muted">
          Amount ({order.currency})
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${field} mt-1 tabular-nums`} />
        </label>
        <label className="text-xs text-final-muted">
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${field} mt-1`}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-final-muted sm:col-span-1">
          Reference or note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. GTBank transfer 0123" className={`${field} mt-1`} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-final-ember">{error}</p>}
      <button type="submit" disabled={saving || note.trim().length < 3} className="btn-primary px-4 py-2 disabled:opacity-50">
        {saving ? 'Recording' : 'Record payment'}
      </button>
    </form>
  )
}

/** Courier and tracking reference, shown to the customer on Track Order. */
function ShipmentForm({ order, onSaved }: { order: Order; onSaved: (o: Order) => void }) {
  const [carrier, setCarrier] = useState(order.shipping_carrier ?? '')
  const [ref, setRef] = useState(order.shipping_reference ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setState('saving')
    const res = await fetch('/api/admin/orders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: order.order_number, shippingCarrier: carrier, shippingReference: ref }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setState('error'); setError(data?.error || 'Could not save.'); return }
    setState('saved')
    onSaved(data.order)
  }
  const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm focus:border-final-off-white/60 focus:outline-none'
  return (
    <form onSubmit={save} className="space-y-2">
      <h4 className="text-xs uppercase tracking-[0.12em] text-final-muted">Shipment</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-final-muted">Courier
          <input value={carrier} onChange={(e) => { setCarrier(e.target.value); setState('idle') }} placeholder="e.g. GIG Logistics" className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-final-muted">Tracking reference
          <input value={ref} onChange={(e) => { setRef(e.target.value); setState('idle') }} placeholder="Courier's tracking number" className={`${field} mt-1`} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={state === 'saving'} className="btn-secondary px-4 py-1.5">{state === 'saving' ? 'Saving' : 'Save shipment'}</button>
        {state === 'saved' && <span role="status" className="text-xs text-final-muted">Saved. The customer sees this on Track Order.</span>}
        {state === 'error' && <span role="alert" className="text-xs text-final-ember">{error}</span>}
      </div>
    </form>
  )
}

function AdminOrders() {
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [filters, setFilters] = useState({ q: params.get('q') ?? '', status: params.get('status') ?? '', payment: params.get('payment') ?? '' })
  const [orders, setOrders] = useState<Order[]>([])
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [can, setCan] = useState({ update: false, recordPayment: false })
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // Orders that arrived while this page was open get a "New" marker.
  const seenIds = useRef<Set<string> | null>(null)
  const [arrived, setArrived] = useState<Set<string>>(new Set())

  const fetchOrders = useCallback(async () => {
    try {
      const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][])
      const res = await fetch(`/api/admin/orders?${qs}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setBanner({ tone: 'error', text: data?.error || 'Unable to load orders.' })
      const list: Order[] = data.orders || []
      if (seenIds.current === null) seenIds.current = new Set(list.map((o) => o.order_number))
      const fresh = list.filter((o) => !seenIds.current!.has(o.order_number)).map((o) => o.order_number)
      if (fresh.length) {
        fresh.forEach((n) => seenIds.current!.add(n))
        setArrived((prev) => new Set([...prev, ...fresh]))
      }
      setOrders(list)
      setTransitions(data.transitions || [])
      setCan(data.can || { update: false, recordPayment: false })
      setLastUpdated(new Date())
    } catch {
      setBanner({ tone: 'error', text: 'Unable to load orders. Check your connection.' })
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useLiveReload('orders', fetchOrders)
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchOrders, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchOrders])

  /** Next statuses the database will accept for this order. */
  const nextStatuses = (order: Order) =>
    transitions
      .filter((t) => t.from_status === order.status && (!t.requires_payment || order.payment_status === 'paid'))
      .map((t) => t.to_status)

  async function updateStatus(orderNumber: string, status: string) {
    if (status === 'cancelled' && !confirm(`Cancel order ${orderNumber}? This can't be undone.`)) return
    setUpdating(orderNumber)
    setBanner(null)
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, status }),
      })
      const data = await res.json().catch(() => ({}))
      // The server's message explains invalid transitions, e.g. "cannot be confirmed before payment is verified".
      if (!res.ok) return setBanner({ tone: 'error', text: data?.error || 'Update failed.' })
      setOrders((prev) => prev.map((o) => (o.order_number === data.order.order_number ? data.order : o)))
      setLastUpdated(new Date())
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-3xl md:text-4xl">Orders</h1>
          {lastUpdated && <p className="mt-1 text-sm text-final-muted">Updated {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-final-muted">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="h-4 w-4 accent-final-ember" />
            Auto-refresh
          </label>
          <button onClick={fetchOrders} disabled={loading} className="btn-secondary px-4 py-2">
            <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <TrendStrip group="orders" title="Sales and fulfilment trends" />

<form
        role="search"
        onSubmit={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, q: q.trim() })) }}
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        <label htmlFor="order-search" className="sr-only">Search orders</label>
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-final-muted" />
          <input id="order-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, tracking or email"
            className="w-72 rounded-lg border border-final-off-white/15 bg-final-black py-2 pl-9 pr-3 text-sm focus:border-final-off-white/60 focus:outline-none" />
        </div>
        <select aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Filter by payment" value={filters.payment} onChange={(e) => setFilters((f) => ({ ...f, payment: e.target.value }))}
          className="rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm">
          <option value="">All payments</option>
          {Object.entries(PAYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" className="btn-secondary px-4 py-2">Search</button>
        {(filters.q || filters.status || filters.payment) && (
          <button type="button" onClick={() => { setQ(''); setFilters({ q: '', status: '', payment: '' }) }} className="text-sm text-final-muted underline underline-offset-4 hover:text-final-off-white">Clear</button>
        )}
      </form>

      {banner && (
        <div role={banner.tone === 'error' ? 'alert' : 'status'}
          className={`mb-6 flex items-start justify-between gap-4 rounded-lg border p-4 text-sm ${
            banner.tone === 'error' ? 'border-final-ember/40 text-final-ember' : 'border-final-off-white/15 text-final-off-white'
          }`}>
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="text-final-muted hover:text-final-off-white" aria-label="Dismiss">×</button>
        </div>
      )}

      {loading && (
        <div className="space-y-2" aria-label="Loading orders">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
        </div>
      )}
      {!loading && orders.length === 0 && !banner && (
        <div className="rounded-xl border border-dashed border-final-off-white/15 px-6 py-16 text-center">
          <p className="font-semibold">{filters.q || filters.status || filters.payment ? 'No orders match these filters' : 'No orders yet'}</p>
          <p className="mt-1 text-sm text-final-muted">{filters.q || filters.status || filters.payment ? 'Try clearing a filter.' : 'New orders from the store appear here automatically.'}</p>
        </div>
      )}

      <ul className="divide-y divide-final-off-white/10 overflow-hidden rounded-xl border border-final-off-white/10">
        {orders.map((order) => {
          const options = nextStatuses(order)
          const open = expanded === order.order_number
          const canPay = can.recordPayment && order.status === 'pending_payment' && ['unpaid', 'failed', 'pending'].includes(order.payment_status)
          return (
            <li key={order.order_number} className="bg-final-gray">
              <div className="grid grid-cols-2 items-center gap-3 p-4 md:grid-cols-[1.4fr_0.9fr_0.8fr_0.8fr_1.2fr_auto]">
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <p className="flex items-center gap-2 font-mono text-sm font-semibold">
                    {order.order_number}
                    {arrived.has(order.order_number) && (
                      <span className="rounded-full bg-final-ember px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-final-black">New</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-final-muted">{order.email}</p>
                </div>
                <p className="text-sm text-final-muted">{new Date(order.created_at).toLocaleDateString()}</p>
                <p className="text-sm font-semibold tabular-nums">{formatCurrency(order.total)}</p>
                <span className={`w-fit rounded-md border px-2 py-0.5 text-xs font-semibold ${PAYMENT_TONE[order.payment_status] ?? 'border-final-off-white/15 text-final-muted'}`}>
                  {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{STATUS_LABEL[order.status] ?? order.status}</span>
                  {can.update && options.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && updateStatus(order.order_number, e.target.value)}
                      disabled={updating === order.order_number}
                      aria-label={`Change status of ${order.order_number}`}
                      className="rounded-md border border-final-off-white/15 bg-final-black px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="">Move to…</option>
                      {options.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
                    </select>
                  )}
                </div>
                <button
                  onClick={() => setExpanded(open ? null : order.order_number)}
                  aria-expanded={open}
                  aria-label={open ? 'Hide details' : 'Show details'}
                  className="justify-self-end rounded-md p-2 hover:bg-final-off-white/5"
                >
                  <FiChevronDown className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {open && (
                <div className="grid gap-6 border-t border-final-off-white/10 bg-final-black/40 p-4 md:grid-cols-3">
                  <div>
                    <h4 className="mb-2 text-xs uppercase tracking-[0.12em] text-final-muted">Items</h4>
                    <ul className="space-y-1 text-sm">
                      {Array.isArray(order.order_items) && order.order_items.map((item: any, idx: number) => (
                        <li key={idx} className="flex justify-between gap-3">
                          <span>
                            {item.name} × {item.quantity}
                            {[item.size, item.color].some(Boolean) ? ` (${[item.size, item.color].filter(Boolean).join(', ')})` : ''}
                            {item.preorder && <span className="ml-1 text-xs text-final-ember">pre-order{item.ships_on ? `, ships ${item.ships_on}` : ''}</span>}
                          </span>
                          <span className="tabular-nums text-final-muted">{formatCurrency(item.price)}</span>
                        </li>
                      ))}
                    </ul>
                    {Number(order.discount) > 0 && (
                      <p className="mt-2 text-sm text-final-muted">Discount{order.promo_code ? ` (${order.promo_code})` : ''}: -{formatCurrency(order.discount)}</p>
                    )}
                    {Array.isArray(order.stock_shortfall) && order.stock_shortfall.length > 0 && (
                      <p role="alert" className="mt-2 rounded-md border border-final-ember/40 p-2 text-xs text-final-ember">
                        Stock ran short when this was paid: {order.stock_shortfall.map((l: any) => `${l.name}${l.size ? ` (${l.size})` : ''} ${l.missing} missing`).join('; ')}. Restock, or contact the customer about a refund.
                      </p>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs uppercase tracking-[0.12em] text-final-muted">Shipping</h4>
                    <div className="space-y-1 text-sm text-final-muted">
                      <p className="text-final-off-white">{order.shipping_address}</p>
                      {order.shipping_city && <p>{[order.shipping_city, order.shipping_state, order.shipping_postal_code].filter(Boolean).join(', ')}</p>}
                      {order.shipping_country && <p>{order.shipping_country}</p>}
                      <p className="pt-2 font-mono text-xs">Tracking {order.tracking_number}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs uppercase tracking-[0.12em] text-final-muted">History</h4>
                    <ol className="space-y-1 text-xs text-final-muted">
                      {Array.isArray(order.timeline) && order.timeline.map((event: any, idx: number) => (
                        <li key={idx}>
                          <span className="tabular-nums">{event.date} {event.time}</span> · {event.description}
                        </li>
                      ))}
                    </ol>
                  </div>
{can.update && ['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status) && (
                    <div className="md:col-span-3">
                      <ShipmentForm order={order} onSaved={(o) => setOrders((prev) => prev.map((x) => (x.order_number === o.order_number ? o : x)))} />
                    </div>
                  )}
                  {canPay && (
                    <div className="md:col-span-3">
                      <RecordPayment order={order} onDone={(text) => { setBanner({ tone: 'info', text }); fetchOrders() }} />
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function AdminOrdersPage() {
  return (
    <Suspense>
      <AdminOrders />
    </Suspense>
  )
}
