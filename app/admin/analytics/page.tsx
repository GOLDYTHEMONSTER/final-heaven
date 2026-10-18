'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ColumnChart, DataTable } from '@/components/admin/charts'
import { formatCurrency } from '@/lib/utils/format'

type Summary = Record<string, any>
const RANGES = [{ key: '7d', label: 'Last 7 days' }, { key: '30d', label: 'Last 30 days' }, { key: '90d', label: 'Last 90 days' }]

const num = (v: unknown) => Number(v ?? 0)
const naira = (v: number) => formatCurrency(v)
const compactNaira = (v: number) =>
  '₦' + new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
const count = (v: number) => new Intl.NumberFormat('en-NG').format(v)
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–')
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function Stat({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-final-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-final-muted">{note}</p>}
    </>
  )
  return href ? (
    <Link href={href} className="block rounded-xl border border-final-off-white/10 bg-final-gray p-5 transition-colors hover:border-final-off-white/25">{body}</Link>
  ) : (
    <div className="min-w-0 rounded-xl border border-final-off-white/10 bg-final-gray p-5">{body}</div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-final-off-white/10 bg-final-gray p-5">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-final-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function AnalyticsPage() {
  const [range, setRange] = useState('30d')
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (r: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/analytics?range=${r}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Could not load analytics.')
      setData(body.summary)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(range) }, [range, load])

  const s = data
  const daily: { day: string; paidOrders: number; gross: number; visitors: number }[] = s?.daily ?? []

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-3xl md:text-4xl">Analytics</h1>
          <p className="mt-1 text-sm text-final-muted">Sales and customers from your orders. Days are in Lagos time. Visitor traffic is in Vercel Analytics.</p>
        </div>
        {/* One filter row; it scopes everything below. */}
        <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-lg border border-final-off-white/15 p-1">
          {RANGES.map((r) => (
            <button key={r.key} role="radio" aria-checked={range === r.key} onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${range === r.key ? 'bg-final-off-white text-final-black' : 'text-final-muted hover:text-final-off-white'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}

      {!s && loading && (
        <div className="grid gap-4 md:grid-cols-4" aria-label="Loading analytics">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      )}

      {s && (
        // Refetch keeps the frame: previous numbers dim instead of flashing.
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <section className="grid gap-4 lg:grid-cols-[1.3fr_2fr]">
            <div className="rounded-xl border border-final-off-white/10 bg-final-gray p-6">
              <p className="text-sm text-final-muted">Gross sales</p>
              <p className="mt-2 text-5xl font-semibold leading-none">{naira(num(s.sales.gross))}</p>
              <p className="mt-3 text-sm text-final-muted">
                From {count(num(s.orders.paid))} verified paid {num(s.orders.paid) === 1 ? 'order' : 'orders'}. Refunds aren’t tracked yet, so this is before refunds.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Paid orders" value={count(num(s.orders.paid))} note={`of ${count(num(s.orders.placed))} placed`} />
              <Stat label="Average order" value={naira(num(s.sales.averageOrderValue))} />
              <Stat label="Orders placed" value={count(num(s.orders.placed))} note="any status" />
              <Stat label="Paid rate" value={pct(num(s.orders.paid), num(s.orders.placed))} note="paid ÷ placed" />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3" aria-label="Operations right now">
            <Stat label="To fulfil now" value={count(num(s.fulfilment.toFulfil))} note="confirmed or processing" href="/admin/orders?status=confirmed" />
            <Stat label="In transit now" value={count(num(s.fulfilment.inTransit))} note="shipped, not delivered" href="/admin/orders?status=shipped" />
            <Stat label="Awaiting payment now" value={count(num(s.fulfilment.awaitingPaymentNow))} note="placed, not yet paid" href="/admin/orders?status=pending_payment" />
          </section>

          <Card title="Sales per day" subtitle="Verified paid orders, by the day they were placed. Latest day highlighted.">
            <ColumnChart label="Gross sales per day" format={naira} axisFormat={compactNaira}
              points={daily.map((d) => ({ label: dayLabel(d.day), value: num(d.gross) }))} />
            <DataTable caption="Sales per day" columns={['Day', 'Paid orders', 'Gross sales']}
              rows={daily.map((d) => [dayLabel(d.day), num(d.paidOrders), naira(num(d.gross))])} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Visitors and traffic" subtitle="Page views, sources, countries and devices.">
              <p className="text-sm text-final-muted">
                Visitor analytics run on Vercel Web Analytics: cookieless, and visitors with Do Not Track or Global Privacy Control aren’t counted.
                Open your project in Vercel and choose <span className="text-final-off-white">Analytics</span>.
              </p>
              <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4 px-4 py-2">
                Open Vercel
              </a>
              <p className="mt-3 text-xs text-final-muted">Shopping steps (product views, add to cart, checkout) are sent as custom events, which Vercel stores on Pro plans.</p>
            </Card>
            <Card title="Top products" subtitle="By revenue from paid orders.">
              {s.topProducts.length ? (
                <ol className="divide-y divide-final-off-white/10 text-sm">
                  {s.topProducts.map((p: any, i: number) => (
                    <li key={p.productId ?? i} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="truncate"><span className="mr-2 text-final-muted tabular-nums">{i + 1}</span>{p.name}</span>
                      <span className="shrink-0 text-right tabular-nums">
                        {naira(num(p.revenue))}
                        <span className="block text-xs text-final-muted">{count(num(p.units))} sold</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-final-muted">No paid orders in this period.</p>}
            </Card>
            <Card title="Customers" subtitle="People with a paid order in this period, by email.">
              <dl className="grid grid-cols-3 gap-3 text-center">
                {[['Paying', s.customers.paying], ['New', s.customers.new], ['Returning', s.customers.repeat]].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg border border-final-off-white/10 p-3">
                    <dt className="text-xs text-final-muted">{k}</dt>
                    <dd className="mt-1 text-xl font-semibold">{count(num(v))}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/admin/customers" className="mt-4 inline-block text-sm text-final-muted underline underline-offset-4 hover:text-final-off-white">See all customers</Link>
            </Card>
          </div>

          {(num(s.orders.unverifiedLegacy) > 0 || num(s.orders.awaitingPayment) > 0) && (
            <p className="text-sm text-final-muted">
              Not counted as sales: {count(num(s.orders.awaitingPayment))} awaiting payment ({naira(num(s.orders.awaitingPaymentValue))})
              {num(s.orders.unverifiedLegacy) > 0 && <> and {count(num(s.orders.unverifiedLegacy))} older orders recorded as paid outside the system ({naira(num(s.orders.unverifiedLegacyValue))})</>}.
            </p>
          )}

          <details className="rounded-xl border border-final-off-white/10 p-5 text-sm">
            <summary className="cursor-pointer font-semibold">How these numbers are calculated</summary>
            <dl className="mt-4 grid gap-3 text-final-muted md:grid-cols-2">
              <div><dt className="font-medium text-final-off-white">Gross sales</dt><dd>Total of orders placed in the period whose payment was verified by Flutterwave or recorded by staff. Before refunds.</dd></div>
              <div><dt className="font-medium text-final-off-white">Paid orders</dt><dd>Orders placed in the period with a verified payment. Awaiting-payment and older unverified orders are excluded.</dd></div>
              <div><dt className="font-medium text-final-off-white">Average order</dt><dd>Gross sales ÷ paid orders.</dd></div>
              <div><dt className="font-medium text-final-off-white">Orders placed</dt><dd>All orders created in the period, whatever their status.</dd></div>
              <div><dt className="font-medium text-final-off-white">Paid rate</dt><dd>Paid orders ÷ orders placed, for the same period.</dd></div>
              <div><dt className="font-medium text-final-off-white">New vs returning</dt><dd>New: their first ever paid order is in this period. Returning: two or more paid orders in total.</dd></div>
              <div><dt className="font-medium text-final-off-white">Visitors</dt><dd>Counted by Vercel Web Analytics and shown in the Vercel dashboard, not here.</dd></div>
            </dl>
          </details>
        </div>
      )}
    </div>
  )
}
