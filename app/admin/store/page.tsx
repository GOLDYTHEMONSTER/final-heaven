'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDay, type PaymentsState } from '@/lib/catalog'

type Selling = { paymentsOpenOn: string | null; purchasesPaused: boolean; today: string; payments: PaymentsState }

const field = 'rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm text-final-off-white focus:border-final-off-white/40 focus:outline-none'
const button = 'rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50'

function status(s: Selling) {
  if (s.payments.open) return { label: 'Open', tone: 'text-green-400', detail: 'Customers can check out and pay.' }
  if (s.payments.closedFor === 'paused') return { label: 'Paused', tone: 'text-yellow-400', detail: 'Nobody can pay until you resume. The store still shows everything and customers can fill their carts.' }
  return {
    label: 'Closed until launch',
    tone: 'text-final-ember',
    detail: s.paymentsOpenOn
      ? `Checkout opens on ${formatDay(s.paymentsOpenOn)} (midnight, Lagos time). Until then customers can browse and fill their carts.`
      : 'No launch day set. Customers can browse and fill their carts, but checkout stays closed until you set one.',
  }
}

export default function StoreSellingPage() {
  const [selling, setSelling] = useState<Selling | null>(null)
  const [launchDay, setLaunchDay] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/store').then(async (res) => {
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t load the store’s settings.')
      setSelling(data)
      setLaunchDay(data.paymentsOpenOn ?? '')
    }).catch((e) => setError((e as Error).message))
  }, [])

  async function save(changes: { payments_open_on?: string | null; purchases_paused?: boolean }) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/store', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Couldn’t save.')
      setSelling(data)
      setLaunchDay(data.paymentsOpenOn ?? '')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const s = selling && status(selling)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="display text-3xl md:text-4xl">Store</h1>
        <p className="mt-1 text-sm text-final-muted">
          Whether customers can pay. Changes apply at once. To stop sales of a single product, pause it on the{' '}
          <Link href="/admin" className="underline underline-offset-2 hover:text-final-off-white">Products</Link> page.
        </p>
      </div>

      {error && <div role="alert" className="mb-6 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}

      {!selling || !s ? (
        !error && <p className="text-sm text-final-muted">Loading…</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-final-muted">Checkout</p>
            <p className={`mt-1 text-2xl font-semibold ${s.tone}`}>{s.label}</p>
            <p className="mt-1 text-sm text-final-muted">{s.detail}</p>
          </section>

          <section className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
            <h2 className="font-semibold">Launch day</h2>
            <p className="mt-1 text-sm text-final-muted">Checkout opens on its own at midnight (Lagos time) on this day.</p>
            <form
              className="mt-4 flex flex-wrap items-center gap-3"
              onSubmit={(e) => { e.preventDefault(); save({ payments_open_on: launchDay || null }) }}
            >
              <label className="sr-only" htmlFor="launch-day">Launch day</label>
              <input id="launch-day" type="date" value={launchDay} onChange={(e) => setLaunchDay(e.target.value)} className={field} />
              <button type="submit" disabled={saving || launchDay === (selling.paymentsOpenOn ?? '')} className={`${button} bg-final-off-white text-final-black hover:bg-final-off-white/90`}>
                Save
              </button>
              {(!selling.paymentsOpenOn || selling.paymentsOpenOn > selling.today) && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => confirm('Open checkout now? Customers will be able to pay straight away.') && save({ payments_open_on: selling.today })}
                  className={`${button} border border-final-off-white/20 hover:border-final-off-white/50`}
                >
                  Open today
                </button>
              )}
              {selling.paymentsOpenOn && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => confirm('Clear the launch day? Checkout closes until you set one again.') && save({ payments_open_on: null })}
                  className={`${button} text-final-muted hover:text-final-off-white`}
                >
                  Clear
                </button>
              )}
            </form>
          </section>

          <section className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
            <h2 className="font-semibold">Pause all purchases</h2>
            <p className="mt-1 text-sm text-final-muted">
              Stops every payment, e.g. while you restock or fix a problem. The store stays visible and carts are kept.
              {selling.purchasesPaused && selling.payments.closedFor === 'launch' && ' It takes effect after launch day.'}
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                const pause = !selling.purchasesPaused
                if (pause && !confirm('Pause all purchases? Nobody can pay until you resume.')) return
                save({ purchases_paused: pause })
              }}
              className={`${button} mt-4 ${selling.purchasesPaused ? 'bg-green-500 text-final-black hover:bg-green-400' : 'bg-yellow-400 text-final-black hover:bg-yellow-300'}`}
            >
              {selling.purchasesPaused ? 'Resume purchases' : 'Pause all purchases'}
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
