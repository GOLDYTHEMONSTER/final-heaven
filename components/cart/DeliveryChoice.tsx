'use client'

import { arrivalText, type DeliveryOption } from '@/lib/delivery'
import type { ServerQuote } from '@/lib/useQuote'
import { formatCurrency } from '@/lib/utils/format'

/**
 * Delivery at checkout: when the order arrives, and the choice of Express by
 * air when something in it comes from China. The fee shown is the server's.
 */
export function DeliveryChoice({ delivery, value, onChange }:
  { delivery: ServerQuote['delivery']; value: DeliveryOption; onChange: (v: DeliveryOption) => void }) {
  const { estimates, expressFee } = delivery
  if (expressFee == null || !estimates.express) {
    return (
      <div className="rounded-lg border border-final-light-gray/30 p-4 text-sm">
        <p className="font-semibold text-final-off-white">Delivery · Free</p>
        <p className="mt-1 text-final-off-white/70">Get it {arrivalText(estimates.standard)}</p>
      </div>
    )
  }
  const options = [
    { id: 'standard' as const, name: 'Standard', price: 'Free', estimate: estimates.standard },
    { id: 'express' as const, name: 'Express by air', price: `+${formatCurrency(expressFee)}`, estimate: estimates.express },
  ]
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-final-off-white/80">Delivery</legend>
      {options.map((o) => (
        <label
          key={o.id}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm transition-colors ${
            value === o.id ? 'border-final-accent bg-final-accent/5' : 'border-final-light-gray/30 hover:border-final-light-gray/60'
          }`}
        >
          <input type="radio" name="delivery" value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-final-accent" />
          <span className="flex-1">
            <span className="flex justify-between gap-3 font-semibold text-final-off-white">
              <span>{o.name}</span>
              <span>{o.price}</span>
            </span>
            <span className="mt-1 block text-final-off-white/70">Get it {arrivalText(o.estimate)}</span>
          </span>
        </label>
      ))}
      <p className="text-xs text-final-muted">Express is priced on the weight of the items coming from China.</p>
    </fieldset>
  )
}
