'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BarList } from '@/components/admin/charts'

type Overview = Record<string, any>
const num = (v: unknown) => Number(v ?? 0)
const count = (v: number) => new Intl.NumberFormat('en-NG').format(v)
const LISTS: Record<string, string> = { launch_waitlist: 'Launch waitlist', membership_waitlist: 'Membership waitlist', footer: 'Footer sign-up' }

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

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-final-muted">{children}</p>
const link = 'underline underline-offset-4 hover:text-final-off-white'

/** Audience, catalogue, margins, hype, email and suppliers, for the range chosen on the Analytics page. */
export function BusinessOverview({ range }: { range: string }) {
  const [o, setO] = useState<Overview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setError('')
    fetch(`/api/admin/overview?range=${range}`, { cache: 'no-store' }).then(async (res) => {
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Could not load the business overview.')
      if (live) setO(body.overview)
    }).catch((e) => live && setError((e as Error).message))
    return () => { live = false }
  }, [range])

  if (error) return <div role="alert" className="rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>
  if (!o) return <div className="skeleton h-40 rounded-xl" aria-label="Loading business overview" />

  const audience: any[] = o.audience ?? []
  const cat = o.catalogue ?? {}
  const m = o.margins ?? {}
  const email = o.email ?? {}
  const sup = o.suppliers ?? {}
  const listRows = ['launch_waitlist', 'membership_waitlist', 'footer'].map((k) => audience.find((a) => a.source === k) ?? { source: k, subscribed: 0, newInRange: 0, unsubscribedInRange: 0 })

  return (
    <div className="space-y-6" aria-label="Business overview">
      <h2 className="display text-xl">Business overview</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Audience" subtitle="Subscribed people per list. New and unsubscribed are for the selected range.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-final-muted"><th className="pb-2 font-normal">List</th><th className="pb-2 text-right font-normal">Subscribed</th><th className="pb-2 text-right font-normal">New</th><th className="pb-2 text-right font-normal">Left</th></tr></thead>
              <tbody className="divide-y divide-final-off-white/10 tabular-nums">
                {listRows.map((r) => (
                  <tr key={r.source}><td className="py-2">{LISTS[r.source]}</td><td className="py-2 text-right">{count(num(r.subscribed))}</td><td className="py-2 text-right">{count(num(r.newInRange))}</td><td className="py-2 text-right">{count(num(r.unsubscribedInRange))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Email" subtitle="Order and staff emails, and campaigns, in the selected range.">
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[['Sent', email.sent], ['Failed', email.failed], ['Skipped', email.skipped]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg border border-final-off-white/10 p-3">
                <dt className="text-xs text-final-muted">{k}</dt>
                <dd className={`mt-1 text-xl font-semibold ${k === 'Failed' && num(v) > 0 ? 'text-final-ember' : ''}`}>{count(num(v))}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-final-muted">
            {count(num(email.campaignsSent))} {num(email.campaignsSent) === 1 ? 'campaign' : 'campaigns'} sent to {count(num(email.campaignRecipients))} recipients.{' '}
            <Link href="/studio/campaigns" className={link}>Campaigns</Link>
          </p>
        </Card>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Catalogue">
        <Stat label="Active products" value={count(num(cat.active))} note="on sale" />
        <Stat label="Drafts" value={count(num(cat.draft))} />
        <Stat label="Archived" value={count(num(cat.archived))} />
        <Stat label="Suppliers" value={count(num(sup.count))} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Active per category">
          {(cat.byCategory ?? []).length
            ? <BarList format={count} rows={(cat.byCategory as any[]).map((c) => ({ label: c.category, value: num(c.products) }))} />
            : <Empty>No active products.</Empty>}
        </Card>
        <Card title="Low stock" subtitle={`Held stock of 2 or fewer${num(cat.lowStockCount) > 12 ? ` (12 of ${num(cat.lowStockCount)} shown)` : ''}.`}>
          {(cat.lowStock ?? []).length ? (
            <ul className="divide-y divide-final-off-white/10 text-sm">
              {(cat.lowStock as any[]).map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                  <Link href={`/studio?edit=${p.id}`} className="truncate hover:underline">{p.name}</Link>
                  <span className={`shrink-0 tabular-nums ${num(p.stock) === 0 ? 'text-final-ember' : ''}`}>{num(p.stock) === 0 ? 'sold out' : `${num(p.stock)} left`}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing running low.</Empty>}
        </Card>
        <Card title="Products missing data" subtitle={num(cat.missingDataCount) ? `${count(num(cat.missingDataCount))} active ${num(cat.missingDataCount) === 1 ? 'product' : 'products'}${num(cat.missingDataCount) > 12 ? ', 12 shown' : ''}.` : undefined}>
          {(cat.missingData ?? []).length ? (
            <ul className="divide-y divide-final-off-white/10 text-sm">
              {(cat.missingData as any[]).map((p) => (
                <li key={p.id} className="py-2">
                  <Link href={`/studio?edit=${p.id}`} className="block truncate hover:underline">{p.name}</Link>
                  <span className="text-xs text-final-muted">{(p.issues as string[]).join(', ')}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Every active product is complete.</Empty>}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Gross margin" subtitle="Provisional: selling price against landed cost (supplier cost, shipping, customs). Before fees, ads and refunds.">
          {num(m.products) > 0 ? (
            <>
              <p className="text-3xl font-semibold">{num(m.average).toFixed(1)}%</p>
              <p className="mt-1 text-xs text-final-muted">average over {count(num(m.products))} active {num(m.products) === 1 ? 'product' : 'products'} with a known cost</p>
              <ol className="mt-4 divide-y divide-final-off-white/10 text-sm">
                {(m.lowest as any[]).map((p, i) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                    <Link href={`/studio?edit=${p.id}`} className="truncate hover:underline"><span className="mr-2 text-final-muted tabular-nums">{i + 1}</span>{p.name}</Link>
                    <span className={`shrink-0 tabular-nums ${num(p.margin) < 0 ? 'text-final-ember' : ''}`}>{num(p.margin).toFixed(1)}%</span>
                  </li>
                ))}
              </ol>
            </>
          ) : <Empty>No active product has a known cost yet.</Empty>}
        </Card>
        {o.hype && (
          <Card title="Hype" subtitle="Hypes given in the selected range.">
            <p className="text-3xl font-semibold">{count(num(o.hype.total))}</p>
            {(o.hype.top ?? []).length > 0 && (
              <ol className="mt-4 divide-y divide-final-off-white/10 text-sm">
                {(o.hype.top as any[]).map((p, i) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="truncate"><span className="mr-2 text-final-muted tabular-nums">{i + 1}</span>{p.name}</span>
                    <span className="shrink-0 tabular-nums">{count(num(p.hypes))}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}
        <Card title="Suppliers" subtitle="Products per supplier, top 5.">
          {(sup.top ?? []).length
            ? <BarList format={count} rows={(sup.top as any[]).map((s) => ({ label: s.name, value: num(s.products) }))} />
            : <Empty>No suppliers yet.</Empty>}
        </Card>
      </div>
    </div>
  )
}
