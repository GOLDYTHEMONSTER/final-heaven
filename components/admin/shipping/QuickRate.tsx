'use client'

import { useState } from 'react'
import { api, field, ghost, label } from './ui'

/**
 * Updates the rate in force in one step: a new price and/or exchange rate from
 * a date (today by default). Every other term is copied from the current rate
 * on the server, which ends the old one the day before. Checkouts already
 * started keep the rate they were priced with.
 */
export function QuickRate({ rate, onDone }: {
  rate: { id: string; currency: string; rate_per_unit: number | string; fx_rate: number | string | null; billing_unit: string }
  onDone: (message: string) => void
}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())
  const [price, setPrice] = useState(String(Number(rate.rate_per_unit)))
  const [fx, setFx] = useState(rate.fx_rate == null ? '' : String(Number(rate.fx_rate)))
  const [from, setFrom] = useState(today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const foreign = rate.currency !== 'NGN'
  const changed = Number(price) !== Number(rate.rate_per_unit) || (foreign && Number(fx) !== Number(rate.fx_rate))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('/api/admin/shipping/rates', { method: 'POST', json: {
        replaces: rate.id, confirmed: true, update: { rate_per_unit: price, ...(foreign ? { fx_rate: fx } : {}), effective_from: from },
      } })
      onDone(`Rate updated from ${from}. New checkouts use it; ones already started keep the old rate.`)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
      <label className={label}>{rate.currency} per {rate.billing_unit}
        <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={`${field} mt-1 w-28`} />
      </label>
      {foreign && (
        <label className={label}>₦ per {rate.currency}
          <input type="number" step="0.01" min="0" value={fx} onChange={(e) => setFx(e.target.value)} className={`${field} mt-1 w-28`} />
        </label>
      )}
      <label className={label}>From
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1`} />
      </label>
      <button type="submit" disabled={busy || !changed} className={ghost}>{busy ? 'Updating…' : 'Update rate'}</button>
      {error && <p className="w-full text-xs text-final-ember">{error}</p>}
    </form>
  )
}
