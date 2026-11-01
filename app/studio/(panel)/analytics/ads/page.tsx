'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AUDIENCES, type AudienceKind } from '@/lib/ads/audiences'
import { CAMPAIGNS, LIMITS, budgetProblem, dailyBudget } from '@/lib/ads/budget'
import { formatCurrency } from '@/lib/utils/format'

type Row = { campaign: string; adSet?: string; ad?: string; visitors: number; orders: number; revenue: number }
type Report = {
  touch: 'first' | 'last'
  totals: { paidOrders: number; paidRevenue: number; adOrders: number; adRevenue: number; adVisitors: number }
  campaigns: Row[]; adSets: Row[]; ads: Row[]
}

const num = (v: unknown) => Number(v ?? 0)
const naira = (v: number) => formatCurrency(v)
const count = (v: number) => new Intl.NumberFormat('en-NG').format(v)
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–')
const lagosDay = (offset = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - offset * 86_400_000))
const PRESETS = [{ label: 'Last 7 days', days: 6 }, { label: 'Last 30 days', days: 29 }, { label: 'Last 90 days', days: 89 }]
// How the ad links must be tagged, set once in Ads Manager under "URL parameters".
const URL_PARAMETERS = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{adset.name}}&utm_term={{ad.name}}'
const input = 'rounded-lg border border-final-off-white/15 bg-transparent px-3 py-2 text-sm'

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-final-off-white/10 bg-final-gray p-5">
      <p className="text-sm text-final-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-final-muted">{note}</p>}
    </div>
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

/** Orders, revenue and conversion for one level (campaign, ad set or ad). */
function Table({ caption, columns, rows }: { caption: string; columns: string[]; rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-final-muted">Nothing tagged in this range yet.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-final-off-white/10">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-final-gray text-xs text-final-muted">
          <tr>
            {columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-medium">{c}</th>)}
            {['Visitors', 'Orders', 'Revenue', 'Conversion'].map((c) => <th key={c} scope="col" className="px-3 py-2 text-right font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-final-off-white/5 tabular-nums">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-1.5">{r.campaign}</td>
              {columns.length > 1 && <td className="px-3 py-1.5">{r.adSet}</td>}
              {columns.length > 2 && <td className="px-3 py-1.5">{r.ad}</td>}
              <td className="px-3 py-1.5 text-right">{count(num(r.visitors))}</td>
              <td className="px-3 py-1.5 text-right">{count(num(r.orders))}</td>
              <td className="px-3 py-1.5 text-right">{naira(num(r.revenue))}</td>
              <td className="px-3 py-1.5 text-right">{pct(num(r.orders), num(r.visitors))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The daily budget for a test, and how it splits across the three campaigns. */
function BudgetHelper() {
  const [target, setTarget] = useState('30')
  const [cpa, setCpa] = useState('5000')
  const [days, setDays] = useState('7')
  const input_ = { targetConversions: Number(target), expectedCpa: Number(cpa), testDays: Number(days) }
  const problem = budgetProblem(input_)
  const budget = useMemo(() => dailyBudget(input_), [target, cpa, days]) // eslint-disable-line react-hooks/exhaustive-deps
  const field = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <label className="block text-sm">
      <span className="text-final-muted">{label}</span>
      <input inputMode="numeric" value={value} onChange={(e) => set(e.target.value.replace(/[^\d]/g, ''))} className={`${input} mt-1 w-full`} />
      <span className="mt-1 block text-xs text-final-muted">{hint}</span>
    </label>
  )
  return (
    <Card title="Budget helper" subtitle="Daily budget = target conversions × expected cost per conversion ÷ test days, shared 70 / 20 / 10.">
      <div className="grid gap-4 sm:grid-cols-3">
        {field('Target conversions', target, setTarget, `Orders you want from the test (${LIMITS.targetConversions.min}+).`)}
        {field('Expected cost per conversion', cpa, setCpa, 'What you expect to pay for one order, in your ad account’s currency.')}
        {field('Test days', days, setDays, `How long the test runs (up to ${LIMITS.testDays.max}).`)}
      </div>
      {problem && <p role="alert" className="mt-4 text-sm text-final-ember">{problem}</p>}
      {budget && (
        <div className="mt-4" aria-live="polite">
          <p className="text-sm text-final-muted">Daily budget</p>
          <p className="text-3xl font-semibold">{count(budget.daily)}</p>
          <p className="mt-1 text-xs text-final-muted">The whole test is expected to cost {count(budget.total)}. The daily figure is rounded up to a whole unit.</p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            {budget.split.map((s) => (
              <div key={s.campaign} className="rounded-lg border border-final-off-white/10 p-3">
                <dt className="text-xs text-final-muted">{s.campaign} · {s.percent}%</dt>
                <dd className="mt-1 text-xl font-semibold">{count(s.daily)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-final-muted">{CAMPAIGNS.join(', ')} are the three campaigns, in that order. See brand/ads/concepts.md.</p>
        </div>
      )}
    </Card>
  )
}

export default function AdsPage() {
  const [from, setFrom] = useState(lagosDay(29))
  const [to, setTo] = useState(lagosDay())
  const [touch, setTouch] = useState<'last' | 'first'>('last')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/ads?from=${from}&to=${to}&touch=${touch}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Could not load the ads report.')
      setReport(body.report)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [from, to, touch])

  useEffect(() => { load() }, [load])

  const t = report?.totals

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link href="/studio/analytics" className="text-sm text-final-muted underline underline-offset-4 hover:text-final-off-white">Analytics</Link>
        <h1 className="display mt-2 text-3xl md:text-4xl">Ads</h1>
        <p className="mt-1 text-sm text-final-muted">Orders and revenue by the ad tags on the link, from verified paid orders. Days are in Lagos time. Nothing here is sent to Meta.</p>
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="block text-final-muted">From</span>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${input} mt-1`} /></label>
          <label className="text-sm"><span className="block text-final-muted">To</span>
            <input type="date" value={to} min={from} max={lagosDay()} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${input} mt-1`} /></label>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { setFrom(lagosDay(p.days)); setTo(lagosDay()) }}
              className="rounded-lg border border-final-off-white/15 px-3 py-2 text-sm text-final-muted hover:text-final-off-white">{p.label}</button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Which visit gets the credit" className="inline-flex rounded-lg border border-final-off-white/15 p-1 lg:ml-auto">
          {([['last', 'Last touch'], ['first', 'First touch']] as const).map(([key, label]) => (
            <button key={key} role="radio" aria-checked={touch === key} onClick={() => setTouch(key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${touch === key ? 'bg-final-off-white text-final-black' : 'text-final-muted hover:text-final-off-white'}`}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}
      {!report && loading && <div className="skeleton h-28 rounded-xl" aria-label="Loading ads report" />}

      {report && t && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Orders from ads" value={count(num(t.adOrders))} note={`of ${count(num(t.paidOrders))} paid orders`} />
            <Stat label="Revenue from ads" value={naira(num(t.adRevenue))} note={`of ${naira(num(t.paidRevenue))} gross, before refunds`} />
            <Stat label="Visitors from ads" value={count(num(t.adVisitors))} note="unique per day" />
            <Stat label="Conversion" value={pct(num(t.adOrders), num(t.adVisitors))} note="ad orders ÷ ad visitors" />
          </section>

          <Card title="By campaign" subtitle="Prospecting, Retention and Retargeting each carry their own campaign name.">
            <Table caption="Ads by campaign" columns={['Campaign']} rows={report.campaigns} />
          </Card>
          <Card title="By ad set" subtitle="utm_content.">
            <Table caption="Ads by ad set" columns={['Campaign', 'Ad set']} rows={report.adSets} />
          </Card>
          <Card title="By ad" subtitle="utm_term.">
            <Table caption="Ads by ad" columns={['Campaign', 'Ad set', 'Ad']} rows={report.ads} />
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BudgetHelper />
        <div className="space-y-6">
          <Card title="Audiences for Meta" subtitle="CSV of hashed emails (SHA-256, lower-cased). Upload it by hand as a customer list. Every download is logged.">
            <ul className="space-y-3 text-sm">
              {(Object.keys(AUDIENCES) as AudienceKind[]).map((kind) => (
                <li key={kind} className="flex items-baseline justify-between gap-3">
                  <span>{AUDIENCES[kind].label}<span className="block text-xs text-final-muted">{AUDIENCES[kind].use}</span></span>
                  <a href={`/api/admin/audiences?kind=${kind}`} download className="shrink-0 underline underline-offset-4 hover:text-final-off-white">Download</a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-final-muted">Warm subscribers are people who agreed to marketing emails, are still subscribed and haven’t bought.</p>
          </Card>
          <Card title="Tag every ad link" subtitle="Paste this into “URL parameters” on each ad in Ads Manager, so orders can be matched to the ad.">
            <code className="block break-all rounded-lg border border-final-off-white/10 p-3 text-xs">{URL_PARAMETERS}</code>
            <p className="mt-3 text-xs text-final-muted">
              Meta’s catalogue feed for Retargeting is at <code>/api/feeds/meta-catalog</code>. Name campaigns, ad sets and ads with names you will recognise here.
            </p>
          </Card>
        </div>
      </div>

      <details className="mt-6 rounded-xl border border-final-off-white/10 p-5 text-sm">
        <summary className="cursor-pointer font-semibold">How these numbers are calculated</summary>
        <dl className="mt-4 grid gap-3 text-final-muted md:grid-cols-2">
          <div><dt className="font-medium text-final-off-white">Orders and revenue</dt><dd>Orders placed in the range with a verified payment whose tags include a campaign or a Meta click ID. Revenue is the order total, before refunds, like gross sales.</dd></div>
          <div><dt className="font-medium text-final-off-white">Last and first touch</dt><dd>Last touch credits the latest tagged link the shopper arrived from; first touch credits the earliest one still kept (30 days in their browser).</dd></div>
          <div><dt className="font-medium text-final-off-white">Visitors</dt><dd>People who landed on a tagged link, counted once per day, anonymously. They match orders by the same campaign, ad set and ad names.</dd></div>
          <div><dt className="font-medium text-final-off-white">Conversion</dt><dd>Orders ÷ visitors for the same tags. A buyer who returns from a different browser or device may not be matched to their first visit.</dd></div>
          <div><dt className="font-medium text-final-off-white">Not counted</dt><dd>Shoppers with Do Not Track or Global Privacy Control on, and shoppers whose browser blocks storage: their orders show as untagged.</dd></div>
        </dl>
      </details>
    </div>
  )
}
