'use client'

// Trend tiles for the operational pages: this period, the change against the
// period before, and a daily sparkline. Follows the admin dataviz rules:
// neutral marks with the latest point in the ember accent, text in text
// tokens, direction shown by an arrow AND words (never colour alone), ember
// only when a change is for the worse, and a table view of every value.
import { useCallback, useEffect, useState } from 'react'
import { FiArrowDownRight, FiArrowUpRight, FiMinus } from 'react-icons/fi'
import { DataTable } from '@/components/admin/charts'
import { useLiveReload, type Section } from '@/components/admin/activity'
import { formatCurrency } from '@/lib/utils/format'

type Pair = [number | string | null, number | string | null]
type Trends = Record<string, any>
export type TrendGroup = 'orders' | 'customers' | 'messages'

const RANGES = [{ key: '7d', label: '7 days' }, { key: '30d', label: '30 days' }, { key: '90d', label: '90 days' }]
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const count = (v: number) => new Intl.NumberFormat('en-NG').format(v)
const naira = (v: number) => formatCurrency(v)
function duration(h: number) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`
  return `${(h / 24).toFixed(1)} days`
}
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

type Tile = {
  label: string
  pair?: Pair
  /** A point-in-time value with no comparison (e.g. "open now"). */
  now?: number | null
  format: (v: number) => string
  lowerIsBetter?: boolean
  /** Volume that is neither good nor bad going up or down (e.g. messages received). */
  neutral?: boolean
  spark?: number[]
  note?: string
}

function Delta({ pair, lowerIsBetter, neutral, days }: { pair: Pair; lowerIsBetter?: boolean; neutral?: boolean; days: number }) {
  const cur = n(pair[0]), prev = n(pair[1])
  const vs = `vs previous ${days} days`
  if (cur === null) return <p className="mt-1 text-xs text-final-muted">No data yet</p>
  if (prev === null || (prev === 0 && cur === 0)) {
    return <p className="mt-1 text-xs text-final-muted">{prev === null ? 'Nothing to compare yet' : `No change ${vs}`}</p>
  }
  if (prev === 0) return <p className="mt-1 text-xs text-final-muted">New this period · none {vs.replace('vs', 'in')}</p>
  const change = (cur - prev) / Math.abs(prev)
  if (Math.abs(change) < 0.005) {
    return <p className="mt-1 text-xs text-final-muted"><FiMinus aria-hidden className="mr-1 inline h-3 w-3" />No change {vs}</p>
  }
  const up = change > 0
  const worse = !neutral && (lowerIsBetter ? up : !up)
  const Icon = up ? FiArrowUpRight : FiArrowDownRight
  return (
    <p className="mt-1 text-xs text-final-muted">
      <span className={`inline-flex items-center gap-0.5 whitespace-nowrap font-semibold tabular-nums ${worse ? 'text-final-ember' : 'text-final-off-white'}`}>
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {up ? 'Up' : 'Down'} {Math.round(Math.abs(change) * 100)}%
      </span>{' '}
      {vs}
    </p>
  )
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const W = 120, H = 28, pad = 3
  const max = Math.max(1, ...values)
  const x = (i: number) => pad + ((W - pad * 2) * i) / (values.length - 1)
  const y = (v: number) => H - pad - ((H - pad * 2) * v) / max
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values.length - 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-7 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={d} fill="none" stroke="rgb(var(--fg) / 0.45)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {/* A zero-length round-capped stroke stays a true circle under the stretched viewBox. */}
      <path d={`M${x(last)},${y(values[last])} l0,0`} stroke="rgb(var(--ember))" strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function TileView({ t, days }: { t: Tile; days: number }) {
  const value = t.pair ? n(t.pair[0]) : n(t.now)
  return (
    <div className="min-w-0 rounded-xl border border-final-off-white/10 bg-final-gray p-4">
      <p className="truncate text-sm text-final-muted">{t.label}</p>
      <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums">{value === null ? '–' : t.format(value)}</p>
      {t.pair ? <Delta pair={t.pair} lowerIsBetter={t.lowerIsBetter} neutral={t.neutral} days={days} /> : <p className="mt-1 text-xs text-final-muted">{t.note ?? 'Right now'}</p>}
      {t.spark && <Sparkline values={t.spark} label={`${t.label}, daily over the last ${days} days`} />}
    </div>
  )
}

function tilesFor(group: TrendGroup, tr: Trends): { tiles: Tile[]; table?: { columns: string[]; rows: (string | number)[][] } } {
  if (group === 'orders' && tr.sales) {
    const s = tr.sales, f = tr.fulfilment
    const daily: any[] = s.daily ?? []
    const shippedDaily: any[] = f?.daily ?? []
    return {
      tiles: [
        { label: 'Orders placed', pair: s.placed, format: count, spark: daily.map((d) => Number(d.orders)) },
        { label: 'Paid sales', pair: s.revenue, format: naira, spark: daily.map((d) => Number(d.revenue)) },
        { label: 'Average paid order', pair: s.averageOrder, format: naira },
        { label: 'Orders shipped', pair: f?.shipped ?? [null, null], format: count, spark: shippedDaily.map((d) => Number(d.shipped)) },
        { label: 'Payment to shipping', pair: f?.hoursToShip ?? [null, null], format: duration, lowerIsBetter: true },
        { label: 'Cancelled', pair: s.cancelled, format: count, lowerIsBetter: true },
      ],
      table: {
        columns: ['Day', 'Orders', 'Paid sales', 'Shipped'],
        rows: daily.map((d, i) => [dayLabel(d.day), Number(d.orders), naira(Number(d.revenue)), Number(shippedDaily[i]?.shipped ?? 0)]),
      },
    }
  }
  if (group === 'customers' && tr.customers) {
    const c = tr.customers
    const cur = (Number(c.new[0]) || 0) + (Number(c.returning[0]) || 0)
    const prev = (Number(c.new[1]) || 0) + (Number(c.returning[1]) || 0)
    const daily: any[] = c.daily ?? []
    return {
      tiles: [
        { label: 'New customers', pair: c.new, format: count, spark: daily.map((d) => Number(d.new)), note: 'first order this period' },
        { label: 'Returning customers', pair: c.returning, format: count },
        {
          label: 'Repeat rate',
          pair: [cur ? Number(c.returning[0]) / cur : null, prev ? Number(c.returning[1]) / prev : null],
          format: (v) => `${Math.round(v * 100)}%`,
        },
        { label: 'Newsletter sign-ups', pair: c.subscribers, format: count },
      ],
      table: { columns: ['Day', 'New customers'], rows: daily.map((d) => [dayLabel(d.day), Number(d.new)]) },
    }
  }
  if (group === 'messages' && tr.messages) {
    const m = tr.messages
    const daily: any[] = m.daily ?? []
    return {
      tiles: [
        { label: 'Messages received', pair: m.received, format: count, neutral: true, spark: daily.map((d) => Number(d.received)) },
        { label: 'Messages handled', pair: m.handled, format: count, neutral: true },
        { label: 'Response time', pair: m.hoursToHandle, format: duration, lowerIsBetter: true },
        { label: 'Open now', now: n(m.openNow), format: count, note: 'waiting for a reply' },
      ],
      table: { columns: ['Day', 'Received'], rows: daily.map((d) => [dayLabel(d.day), Number(d.received)]) },
    }
  }
  return { tiles: [] }
}

const noop = () => {}
const SECTION: Record<TrendGroup, Section> = { orders: 'orders', customers: 'customers', messages: 'messages' }

/** A row of trend tiles with its own period switch. Refreshes live when new activity lands in its section. */
export function TrendStrip({ group, title = 'Trends' }: { group: TrendGroup; title?: string }) {
  const [range, setRange] = useState('30d')
  const [data, setData] = useState<Trends | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/trends?range=${range}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Could not load trends.')
      setData(body.trends)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load trends.')
    } finally {
      setLoading(false)
    }
  }, [range])
  useEffect(() => { load() }, [load])
  useLiveReload(SECTION[group], load)
  // Customer numbers come from orders too (a first order makes a new customer).
  useLiveReload('orders', group === 'customers' ? load : noop)

  const days = Number(data?.days ?? range.replace('d', ''))
  const { tiles, table } = data ? tilesFor(group, data) : { tiles: [] as Tile[], table: undefined }
  const cols = group === 'orders' ? 'sm:grid-cols-3 xl:grid-cols-6' : 'sm:grid-cols-2 xl:grid-cols-4'

  return (
    <section aria-labelledby={`trends-${group}`} className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id={`trends-${group}`} className="text-sm font-semibold">{title}</h2>
        <div role="group" aria-label="Trend period" className="inline-flex rounded-lg border border-final-off-white/10 p-0.5 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`rounded-md px-2.5 py-1 transition-colors ${range === r.key ? 'bg-final-off-white text-final-black' : 'text-final-muted hover:text-final-off-white'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-final-ember/40 p-3 text-sm text-final-ember">{error}</p>}
      {!data && loading && (
        <div className={`grid grid-cols-2 gap-3 ${cols}`} aria-label="Loading trends">
          {Array.from({ length: group === 'orders' ? 6 : 4 }, (_, i) => <div key={i} className="skeleton h-[124px] rounded-xl" />)}
        </div>
      )}
      {data && (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className={`grid grid-cols-2 gap-3 ${cols}`}>
            {tiles.map((t) => <TileView key={t.label} t={t} days={days} />)}
          </div>
          {table && <DataTable caption={`${title}, daily`} columns={table.columns} rows={table.rows} />}
        </div>
      )}
    </section>
  )
}
