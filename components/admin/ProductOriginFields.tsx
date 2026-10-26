'use client'

// Where a product comes from and how it's supplied, in the product editor.
// These are public product columns (customers see "Final Heaven Original",
// a label's name, or "Made to order"); costs and supplier terms live in
// SourcingFields instead.

const field = 'w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-3 py-2 text-sm text-final-off-white focus:outline-none focus:border-final-accent'
const label = 'block text-final-off-white/70 text-xs mb-1'

const SOURCES: [string, string][] = [
  ['original', 'Final Heaven Original (our design)'],
  ['wholesale', 'Wholesale supplier'],
  ['distributor', 'Authorised distributor'],
  ['local_maker', 'Local manufacturer'],
  ['independent', 'Independent label'],
]

export type Origin = { source_type: string; brand_id: string; fulfilment: string; lead_time_days: string; sku: string }

export function ProductOriginFields({ value, onChange, brands }: {
  value: Origin
  onChange: (patch: Partial<Origin>) => void
  brands: { id: string; name: string }[]
}) {
  return (
    <fieldset className="rounded-lg border border-final-light-gray/30 p-4">
      <legend className="px-1 text-sm text-final-off-white/70">Origin and supply</legend>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={label} htmlFor="origin-source">Comes from</label>
          <select id="origin-source" value={value.source_type || 'original'} onChange={(e) => onChange({ source_type: e.target.value })} className={field}>
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={label} htmlFor="origin-brand">Label</label>
          <select id="origin-brand" value={value.brand_id ?? ''} onChange={(e) => onChange({ brand_id: e.target.value })} className={field}>
            <option value="">None</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {value.source_type === 'independent' && !value.brand_id && (
            <p className="mt-1 text-xs text-yellow-400">Pick the label (add it under Labels first) so customers see whose it is.</p>
          )}
        </div>
        <div>
          <label className={label} htmlFor="origin-supply">Supply</label>
          <select id="origin-supply" value={value.fulfilment || 'stock'} onChange={(e) => onChange({ fulfilment: e.target.value })} className={field}>
            <option value="stock">In stock, ready to ship</option>
            <option value="made_to_order">Made to order</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="origin-lead">Days to make{value.fulfilment === 'made_to_order' ? ' *' : ''}</label>
          <input id="origin-lead" type="number" min="1" max="180" value={value.lead_time_days ?? ''} disabled={value.fulfilment !== 'made_to_order'}
            required={value.fulfilment === 'made_to_order'} onChange={(e) => onChange({ lead_time_days: e.target.value })} className={`${field} disabled:opacity-40`} />
        </div>
        <div className="col-span-2">
          <label className={label} htmlFor="origin-sku">SKU (optional)</label>
          <input id="origin-sku" value={value.sku ?? ''} maxLength={60} onChange={(e) => onChange({ sku: e.target.value })} placeholder="FH-TEE-001" className={field} />
        </div>
      </div>
      <p className="mt-2 text-xs text-final-off-white/50">
        Made to order shows customers it ships about that many days after payment, so nothing is sold as ready when it isn&apos;t.
        For stock that hasn&apos;t arrived yet, use a pre-order with its ship date instead.
      </p>
    </fieldset>
  )
}
