'use client'

import { useEffect, useRef, useState } from 'react'
import type { Source } from '@/components/admin/SourcingFields'

// A product's shipping profile in the product editor, with its price
// breakdown worked out on the server (/api/admin/shipping/products) as staff
// type. Staff-only; saved after the product, never shown to customers.

export type ProfileForm = {
  variant: string; method: string; weight: string; packaging: string; weight_unit: string; length: string; width: string; height: string; dimension_unit: string
  data_status: string; class_key: string; value_tier: string; target_pct: string; min_contribution: string; max_contribution: string; adjustment_factor: string
  clearance_eligible: boolean; subsidy_eligible: boolean; platform_contribution: string; competitor_price: string; override_contribution: string; override_reason: string
}
export type ShippingForm = { profiles: ProfileForm[]; dirty: boolean; canManage: boolean } | null

const s = (v: unknown) => (v == null ? '' : String(v))
const BLANK: ProfileForm = {
  variant: '', method: 'air', weight: '', packaging: '', weight_unit: 'g', length: '', width: '', height: '', dimension_unit: 'cm', data_status: 'estimated',
  class_key: '', value_tier: 'standard', target_pct: '', min_contribution: '', max_contribution: '', adjustment_factor: '1', clearance_eligible: true,
  subsidy_eligible: true, platform_contribution: '', competitor_price: '', override_contribution: '', override_reason: '',
}
/** A saved profile as editor fields, in the units it was entered in. */
function toForm(p: Record<string, any>): ProfileForm {
  const g = p.weight_unit === 'g'
  const inch = p.dimension_unit === 'in'
  const w = (v: unknown) => (v == null ? '' : String(g ? Math.round(Number(v) * 1000 * 10) / 10 : Number(v)))
  const d = (v: unknown) => (v == null ? '' : String(inch ? Math.round((Number(v) / 2.54) * 10) / 10 : Number(v)))
  return {
    variant: s(p.variant), method: p.method, weight: w(p.weight_kg), packaging: w(p.packaging_kg), weight_unit: p.weight_unit, length: d(p.length_cm), width: d(p.width_cm),
    height: d(p.height_cm), dimension_unit: p.dimension_unit, data_status: p.data_status, class_key: s(p.class_key), value_tier: p.value_tier, target_pct: s(p.target_pct),
    min_contribution: s(p.min_contribution), max_contribution: s(p.max_contribution), adjustment_factor: s(p.adjustment_factor ?? 1), clearance_eligible: p.clearance_eligible !== false,
    subsidy_eligible: p.subsidy_eligible !== false, platform_contribution: s(p.platform_contribution), competitor_price: s(p.competitor_price),
    override_contribution: s(p.override_contribution), override_reason: s(p.override_reason),
  }
}

const field = 'w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-3 py-2 text-sm text-final-off-white focus:outline-none focus:border-final-accent'
const label = 'block text-final-off-white/70 text-xs mb-1'
const naira = (k: number | null | undefined) => (k == null ? '—' : `₦${Math.round(k / 100).toLocaleString('en-NG')}`)
const TONE: Record<string, string> = { ready: 'text-emerald-300', ready_with_warnings: 'text-yellow-200', missing_data: 'text-final-off-white/60', needs_review: 'text-final-ember' }

export function ShippingFields({ productId, price, category, source, sizes, value, onChange }: {
  productId: string | null; price: number; category: string; source: Source; sizes: string[]; value: ShippingForm; onChange: (next: ShippingForm) => void
}) {
  const [classes, setClasses] = useState<{ key: string; name: string }[]>([])
  const [hidden, setHidden] = useState(false)
  const [breakdown, setBreakdown] = useState<any>(null)
  const [error, setError] = useState('')
  const loaded = useRef(false)

  // Load the saved profiles once (or start blank for a new product).
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const url = productId ? `/api/admin/shipping/products?id=${encodeURIComponent(productId)}` : null
    if (!url) {
      fetch('/api/admin/shipping/rates').then(async (r) => {
        if (r.status === 401 || r.status === 403) return setHidden(true)
        const d = await r.json()
        setClasses(d.classes ?? [])
        onChange({ profiles: [{ ...BLANK }], dirty: false, canManage: Boolean(d.can?.manage) })
      }).catch(() => setHidden(true))
      return
    }
    fetch(url).then(async (r) => {
      if (r.status === 401 || r.status === 403) return setHidden(true)
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Couldn’t load the shipping profile.')
      setClasses(d.classes ?? [])
      const profiles = (d.profiles ?? []).map(toForm)
      onChange({ profiles: profiles.length ? profiles : [{ ...BLANK }], dirty: false, canManage: Boolean(d.can?.manage) })
    }).catch((e) => setError((e as Error).message))
  }, [productId, onChange])

  // The server's breakdown for what's typed, a moment after typing stops.
  const general = value?.profiles.find((p) => p.variant === '') ?? null
  const key = JSON.stringify([price, category, source, general])
  useEffect(() => {
    if (!value || hidden) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/shipping/products', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: productId, price: Number(price) || 0, category, source, profile: general }) })
        const d = await res.json().catch(() => null)
        if (!res.ok) throw new Error(d?.error || 'Couldn’t work out the price.')
        setBreakdown(d.breakdown)
        setError('')
      } catch (e) { setError((e as Error).message) }
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hidden])

  if (hidden) return null
  if (!value) return <p className="text-xs text-final-off-white/50">Loading shipping…</p>
  const ro = !value.canManage
  const setP = (i: number, patch: Partial<ProfileForm>) => onChange({ ...value, dirty: true, profiles: value.profiles.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const b = breakdown

  return (
    <fieldset className="rounded-lg border border-final-light-gray/30 p-4" disabled={ro}>
      <legend className="px-1 text-sm text-final-off-white/70">Shipping and price split (staff only)</legend>
      {value.profiles.map((p, i) => (
        <div key={p.variant || 'all'} className={i ? 'mt-4 border-t border-final-light-gray/20 pt-4' : ''}>
          <div className="mb-2 flex items-center justify-between text-xs text-final-off-white/70">
            <span>{p.variant ? `Size ${p.variant}` : 'Packed for shipping'}</span>
            {p.variant && !ro && <button type="button" className="text-final-ember underline" onClick={() => onChange({ ...value, dirty: true, profiles: value.profiles.filter((_, j) => j !== i) })}>Remove</button>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={label}>Packed weight</label>
              <div className="flex gap-1">
                <input type="number" min="0" step="any" value={p.weight} onChange={(e) => setP(i, { weight: e.target.value })} className={field} />
                <select aria-label="Weight unit" value={p.weight_unit} onChange={(e) => setP(i, { weight_unit: e.target.value })} className={`${field} w-16 px-1`}><option>g</option><option>kg</option></select>
              </div>
            </div>
            <div><label className={label}>Packaging ({p.weight_unit})</label><input type="number" min="0" step="any" value={p.packaging} onChange={(e) => setP(i, { packaging: e.target.value })} className={field} /></div>
            <div><label className={label}>Measured?</label>
              <select value={p.data_status} onChange={(e) => setP(i, { data_status: e.target.value })} className={field}><option value="estimated">Estimate</option><option value="verified">Measured</option></select>
            </div>
            <div className="col-span-3">
              <label className={label}>Packed size (L × W × H)</label>
              <div className="flex gap-1">
                {(['length', 'width', 'height'] as const).map((k) => <input key={k} aria-label={k} type="number" min="0" step="any" value={p[k]} onChange={(e) => setP(i, { [k]: e.target.value })} className={field} />)}
                <select aria-label="Size unit" value={p.dimension_unit} onChange={(e) => setP(i, { dimension_unit: e.target.value })} className={`${field} w-16 px-1`}><option>cm</option><option>in</option></select>
              </div>
            </div>
          </div>
          {i === 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-final-off-white/60">Method, class and contribution rules</summary>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div><label className={label}>Ships by</label><select value={p.method} onChange={(e) => setP(i, { method: e.target.value })} className={field}><option value="air">Air (per order)</option><option value="sea">Sea (stock batch)</option></select></div>
                <div><label className={label}>Class</label><select value={p.class_key} onChange={(e) => setP(i, { class_key: e.target.value })} className={field}><option value="">By weight</option>{classes.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></div>
                <div><label className={label}>Perceived value</label><select value={p.value_tier} onChange={(e) => setP(i, { value_tier: e.target.value })} className={field}>{['low', 'standard', 'premium', 'luxury'].map((t) => <option key={t}>{t}</option>)}</select></div>
                {([['target_pct', 'Target % (else store’s)'], ['min_contribution', 'Min ₦'], ['max_contribution', 'Max ₦'], ['adjustment_factor', 'Factor ×'], ['platform_contribution', 'Platform ₦ (else store %)'], ['competitor_price', 'Competitor price ₦']] as const).map(([k, l]) => (
                  <div key={k}><label className={label}>{l}</label><input type="number" min="0" step="any" value={p[k]} onChange={(e) => setP(i, { [k]: e.target.value })} className={field} /></div>
                ))}
                <label className="col-span-3 flex flex-wrap gap-4 text-xs text-final-off-white/70">
                  <span className="flex items-center gap-1"><input type="checkbox" checked={p.clearance_eligible} onChange={(e) => setP(i, { clearance_eligible: e.target.checked })} /> Can go on clearance</span>
                  <span className="flex items-center gap-1"><input type="checkbox" checked={p.subsidy_eligible} onChange={(e) => setP(i, { subsidy_eligible: e.target.checked })} /> Campaigns may subsidise its freight</span>
                </label>
                <div><label className={label}>Override contribution ₦</label><input type="number" min="0" step="any" value={p.override_contribution} onChange={(e) => setP(i, { override_contribution: e.target.value })} className={field} /></div>
                {p.override_contribution !== '' && <div className="col-span-2"><label className={label}>Why (recorded)</label><input value={p.override_reason} maxLength={500} onChange={(e) => setP(i, { override_reason: e.target.value })} className={field} /></div>}
              </div>
            </details>
          )}
        </div>
      ))}
      {!ro && sizes.filter((z) => !value.profiles.some((p) => p.variant === z)).length > 0 && (
        <select aria-label="Add a size that packs differently" value="" onChange={(e) => e.target.value && onChange({ ...value, dirty: true, profiles: [...value.profiles, { ...value.profiles[0], variant: e.target.value, override_contribution: '', override_reason: '' }] })} className={`${field} mt-3`}>
          <option value="">A size packs differently…</option>
          {sizes.filter((z) => !value.profiles.some((p) => p.variant === z)).map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      )}

      {error && <p className="mt-3 text-xs text-final-ember">{error}</p>}
      {b && (
        <div className="mt-3 rounded-lg bg-final-black/40 p-3 text-xs text-final-off-white/80">
          <p className={`font-semibold ${TONE[b.status] ?? ''}`}>{b.statusLabel} <span className="font-normal text-final-off-white/50">· estimate {b.confidence}{b.className ? ` · ${b.className}` : ''}{b.chargeableKg != null ? ` · ${b.chargeableKg} kg billed` : ''}</span></p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 tabular-nums">
            <dt>Supplier cost</dt><dd>{naira(b.supplierKobo)}</dd>
            <dt>China-side shipping</dt><dd>{naira(b.chinaKobo)}</dd>
            <dt>Customs and other</dt><dd>{naira(b.customsOtherKobo)}</dd>
            <dt>Payment fees</dt><dd>{b.paymentFeesKobo == null ? 'not set' : naira(b.paymentFeesKobo)}</dd>
            <dt>Shipping contribution{b.flags.includes('override') ? ` (suggested ${naira(b.recommendedKobo)})` : ''}</dt><dd>{naira(b.contributionKobo)}</dd>
            <dt>Platform contribution</dt><dd>{naira(b.platformKobo)}</dd>
            <dt>Product margin</dt><dd>{naira(b.productMarginKobo)}</dd>
            <dt className="border-t border-final-off-white/10 pt-0.5 font-semibold">Price</dt><dd className="border-t border-final-off-white/10 pt-0.5 font-semibold">{naira(b.priceKobo)}</dd>
          </dl>
          <p className="mt-2">
            Freight {naira(b.freightKobo)} a unit: the contribution recovers {b.recoveryPct == null ? '—' : `${b.recoveryPct}%`}{b.unfundedKobo ? `, ${naira(b.unfundedKobo)} left for margin to pay` : ''}.
            {' '}Margin after freight <strong>{naira(b.marginAfterFreightKobo)}{b.marginPct != null ? ` (${b.marginPct}%)` : ''}</strong>.
            {b.proposedPriceKobo != null && ` Price for your target margin: ${naira(b.proposedPriceKobo)}.`}
          </p>
          {b.warnings.length > 0 && <ul className="mt-2 list-disc pl-4 text-yellow-200/90">{b.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}
      {ro && <p className="mt-2 text-xs text-final-off-white/50">You can view this; changing it needs the shipping permission.</p>}
    </fieldset>
  )
}
