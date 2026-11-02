'use client'

import { useCallback, useEffect, useState } from 'react'
import { FiRefreshCw } from 'react-icons/fi'
import { BarList, ColumnChart, DataTable, LineChart } from '@/components/admin/charts'
import { formatCurrency } from '@/lib/utils/format'
import type { EventAnalytics as Data } from '@/lib/events/analytics'

const count = (v: number) => v.toLocaleString('en-GB')
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`)
const naira = (v: number) => formatCurrency(v).replace(/\.00$/, '')
const compactNaira = (v: number) => (v >= 1000 ? `₦${(v / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k` : `₦${v}`)
const card = 'rounded-xl border border-final-off-white/10 bg-final-gray p-5'
const h3 = 'mb-4 font-mono text-xs uppercase tracking-[0.2em] text-final-muted'

/** An event's numbers in Studio: traffic, the funnel, sales by day and tier, and the door. */
export function EventAnalytics({ eventId }: { eventId: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/analytics`, { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Could not load the numbers.')
      setD(body)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [eventId])
  useEffect(() => { load() }, [load])

  if (!d) return <section className={`${card} mt-8`}>{error ? <p role="alert" className="text-sm text-final-ember">{error}</p> : <div className="skeleton h-40 rounded-lg" />}</section>
  const t = d.totals
  const tiles: [string, string, string?][] = [
    ...(d.traffic ? [['Visitors', count(t.visitors), `${count(t.views)} page views`], ['Conversion', pct(t.conversion), 'visitors who paid']] as [string, string, string][] : []),
    ['Tickets sold', count(t.ticketsSold), `of ${count(t.capacity)}`],
    ['Taken', naira(t.revenue), `${count(t.paidOrders)} orders · avg ${naira(t.averageOrder)}`],
    ['Checked in', count(t.checkedIn), `${pct(t.checkInRate)} of sold`],
    ['Waitlist discount', naira(t.discountGiven), `${count(t.codesUsed)} codes used`],
    ['Didn’t pay', count(t.abandoned), `of ${count(t.checkoutsStarted)} checkouts started`],
    ...(t.cancelledOrders ? [['Cancelled', count(t.cancelledOrders), `${count(t.refunded)} refunded`]] as [string, string, string][] : []),
  ]

  return (
    <section aria-labelledby="analytics-h" className="mt-8 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="analytics-h" className="font-semibold">Analytics</h2>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 text-sm text-final-muted hover:text-final-off-white disabled:opacity-50">
          <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Refresh
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value, note]) => (
          <div key={label} className="rounded-lg border border-final-off-white/10 bg-final-black px-3 py-2.5">
            <dt className="text-xs text-final-muted">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
            {note && <dd className="text-xs text-final-muted">{note}</dd>}
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h3 className={h3}>Tickets sold per day</h3>
          <ColumnChart label="Tickets sold per day" points={d.days.map((x) => ({ label: x.label, value: x.tickets }))} format={(v) => `${count(v)} tickets`} axisFormat={count} />
        </div>
        {d.traffic ? (
          <div className={card}>
            <h3 className={h3}>Event page views per day</h3>
            <LineChart label="Event page views per day" points={d.days.map((x) => ({ label: x.label, value: x.views }))} format={(v) => `${count(v)} views`} />
          </div>
        ) : (
          <div className={card}>
            <h3 className={h3}>Money taken per day</h3>
            <ColumnChart label="Money taken per day" points={d.days.map((x) => ({ label: x.label, value: x.revenue }))} format={naira} axisFormat={compactNaira} />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={card}>
          <h3 className={h3}>From visit to ticket</h3>
          <BarList rows={d.traffic ? d.funnel : d.funnel.slice(1)} format={count} emphasise={(d.traffic ? d.funnel.length : d.funnel.length - 1) - 1} />
          {d.traffic && <p className="mt-3 text-xs text-final-muted">A visitor counts once a day. Checkouts started include people who came back to try again.</p>}
        </div>
        {d.traffic && (
          <div className={card}>
            <h3 className={h3}>Where visitors came from</h3>
            <BarList rows={d.sources} format={(v) => `${count(v)} views`} />
          </div>
        )}
        {d.traffic && (
          <div className={card}>
            <h3 className={h3}>Devices</h3>
            <BarList rows={d.devices} format={(v) => `${count(v)} views`} />
          </div>
        )}
      </div>

      <div className={card}>
        <DataTable caption="Tickets by tier" columns={['Ticket', 'Sold', 'Places', 'Left', 'At ticket price']}
          rows={d.tiers.map((x) => [x.name, count(x.sold), count(x.capacity), count(Math.max(0, x.capacity - x.sold)), naira(x.atPrice)])} />
        <p className="mt-2 text-xs text-final-muted">At ticket price is before any waitlist discount; Taken above is what was actually paid.</p>
      </div>

      {t.checkedIn > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <h3 className={h3}>Check-ins by hour</h3>
            <ColumnChart label="Check-ins by hour" points={d.checkInsByHour} format={(v) => `${count(v)} in`} axisFormat={count} />
          </div>
          <div className={card}>
            <h3 className={h3}>Who checked people in</h3>
            <BarList rows={d.doors} format={count} />
          </div>
        </div>
      )}
    </section>
  )
}
