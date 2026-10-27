'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useLiveReload } from '@/components/admin/activity'
import { TrendStrip } from '@/components/admin/Trends'
import { Subscribers } from '@/components/admin/Subscribers'
import { FiChevronDown, FiSearch } from 'react-icons/fi'
import { formatCurrency } from '@/lib/utils/format'

type Customer = {
  email: string
  orders: number
  paid_orders: number
  paid_total: number
  first_order_at: string
  last_order_at: string
  last_city: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment', confirmed: 'Confirmed', processing: 'Processing',
  shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
}
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function CustomerOrders({ email }: { email: string }) {
  const [orders, setOrders] = useState<any[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`/api/admin/orders?email=${encodeURIComponent(email)}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body?.error || 'Could not load orders.')
        setOrders(body.orders)
      })
      .catch((e) => setError(e.message))
  }, [email])

  if (error) return <p className="text-sm text-final-ember">{error}</p>
  if (!orders) return <div className="skeleton h-10 rounded-md" />
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-final-muted">
        <tr><th className="py-1 font-medium">Order</th><th className="py-1 font-medium">Placed</th><th className="py-1 font-medium">Total</th><th className="py-1 font-medium">Status</th><th className="py-1 font-medium">Tracking</th></tr>
      </thead>
      <tbody className="divide-y divide-final-off-white/5">
        {orders.map((o) => (
          <tr key={o.order_number}>
            <td className="py-2 font-mono text-xs">
              <Link href={`/admin/orders?q=${encodeURIComponent(o.order_number)}`} className="underline underline-offset-4 hover:text-final-muted">{o.order_number}</Link>
            </td>
            <td className="py-2 text-final-muted">{date(o.created_at)}</td>
            <td className="py-2 tabular-nums">{formatCurrency(o.total)}</td>
            <td className="py-2">{STATUS_LABEL[o.status] ?? o.status}<span className="block text-xs text-final-muted">{o.payment_status}</span></td>
            <td className="py-2 text-xs text-final-muted">{o.shipping_carrier ? `${o.shipping_carrier} ${o.shipping_reference ?? ''}` : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function CustomersPage() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(query)}&page=${page}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Could not load customers.')
      setRows(body.customers)
      setTotal(body.total)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [query, page])

  useEffect(() => { load() }, [load])
  useLiveReload('orders', load)

  const pages = Math.max(1, Math.ceil(total / 50))

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-3xl md:text-4xl">Customers</h1>
          <p className="mt-1 text-sm text-final-muted">Everyone who has placed an order, grouped by email. {total ? `${total} in total.` : ''}</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()) }} className="flex gap-2" role="search">
          <label htmlFor="customer-search" className="sr-only">Search customers by email</label>
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-final-muted" />
            <input id="customer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email"
              className="w-64 rounded-lg border border-final-off-white/15 bg-final-black py-2 pl-9 pr-3 text-sm focus:border-final-off-white/60 focus:outline-none" />
          </div>
          <button className="btn-secondary px-4 py-2">Search</button>
        </form>
      </div>

      <TrendStrip group="customers" title="Customer trends" />

      <Subscribers />

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}

      {loading && !rows.length && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>}

      {!loading && !rows.length && !error && (
        <div className="rounded-xl border border-dashed border-final-off-white/15 px-6 py-16 text-center">
          <p className="font-semibold">{query ? 'No customers match that search' : 'No customers yet'}</p>
          <p className="mt-1 text-sm text-final-muted">{query ? 'Try part of the email address.' : 'Customers appear here after their first order.'}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className={`overflow-hidden rounded-xl border border-final-off-white/10 ${loading ? 'opacity-50' : ''}`}>
          <div className="hidden grid-cols-[2fr_0.7fr_1fr_1fr_1fr_auto] gap-3 border-b border-final-off-white/10 bg-final-gray px-4 py-2 text-xs text-final-muted md:grid">
            <span>Customer</span><span>Orders</span><span>Paid total</span><span>First order</span><span>Last order</span><span />
          </div>
          <ul className="divide-y divide-final-off-white/10">
            {rows.map((c) => (
              <li key={c.email} className="bg-final-gray">
                <button onClick={() => setOpen(open === c.email ? null : c.email)} aria-expanded={open === c.email}
                  className="grid w-full grid-cols-2 items-center gap-3 px-4 py-3 text-left text-sm hover:bg-final-off-white/[0.03] md:grid-cols-[2fr_0.7fr_1fr_1fr_1fr_auto]">
                  <span className="col-span-2 min-w-0 md:col-span-1">
                    <span className="block truncate font-medium">{c.email}</span>
                    {c.last_city && <span className="text-xs text-final-muted">{c.last_city}</span>}
                  </span>
                  <span className="tabular-nums">{c.orders}<span className="ml-1 text-xs text-final-muted">({c.paid_orders} paid)</span></span>
                  <span className="tabular-nums">{formatCurrency(c.paid_total)}</span>
                  <span className="text-final-muted">{date(c.first_order_at)}</span>
                  <span className="text-final-muted">{date(c.last_order_at)}</span>
                  <FiChevronDown className={`h-5 w-5 justify-self-end transition-transform ${open === c.email ? 'rotate-180' : ''}`} />
                </button>
                {open === c.email && <div className="border-t border-final-off-white/10 bg-final-black/40 px-4 py-3"><CustomerOrders email={c.email} /></div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span className="text-final-muted">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}
