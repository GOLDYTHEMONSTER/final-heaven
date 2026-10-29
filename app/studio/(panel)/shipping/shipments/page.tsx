'use client'

import { useCallback, useEffect, useState } from 'react'
import { Alert, Input, Pill, ShippingHeader, api, button, card, field, ghost, kg, label, naira, pct, requestKey } from '@/components/admin/shipping/ui'

const ALLOCATION: [string, string][] = [
  ['chargeable_weight', 'By chargeable weight'], ['weight', 'By weight'], ['volume', 'By volume'], ['value', 'By goods value'], ['quantity', 'By quantity'],
  ['hybrid', 'Hybrid: freight by volume, duties by value'],
]
const STATUSES = ['planning', 'booked', 'in_transit', 'arrived', 'cancelled']
const BLANK_LINE = { product_id: '', quantity_ordered: '', unit_cost: '', cost_currency: 'CNY', fx_rate: '', unit_weight_kg: '', unit_cbm: '' }
const BLANK_INVOICE = { invoice_ref: '', invoice_date: '', currency: 'NGN', fx_rate: '', chargeable_actual: '', freight_amount: '', additional_fees: '', clearance_charges: '', insurance: '', handling: '', other_costs: '', document_url: '' }

export default function ShipmentsPage() {
  const [data, setData] = useState<any>(null)
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [create, setCreate] = useState({ reference: '', kind: 'orders', method: 'air', rate_id: '', allocation_method: 'chargeable_weight' })
  const [picked, setPicked] = useState<string[]>([])
  const [target, setTarget] = useState('')

  const load = useCallback(async () => {
    try {
      const [d, overview] = await Promise.all([api('/api/admin/shipping/shipments'), products.length ? null : api('/api/admin/shipping')])
      setData(d)
      if (overview) setProducts(overview.products)
    } catch (e) { setError((e as Error).message) }
  }, [products.length])
  useEffect(() => { load() }, [load])

  async function run(body: Record<string, unknown>, done?: string) {
    setError(''); setNotice('')
    try {
      const r = await api('/api/admin/shipping/shipments', { method: 'PUT', json: body })
      if (done) setNotice(done)
      await load()
      return r
    } catch (e) { setError((e as Error).message); return null }
  }

  async function createShipment(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api('/api/admin/shipping/shipments', { method: 'POST', json: { ...create, rate_id: create.rate_id || null } })
      setCreate({ ...create, reference: '' })
      await load()
    } catch (err) { setError((err as Error).message) }
  }

  const can = data?.can ?? {}
  const openOrderShipments = (data?.shipments ?? []).filter((s: any) => s.kind === 'orders' && ['planning', 'booked'].includes(s.status))

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <ShippingHeader title="Shipments" intro="Group paid orders into consolidated air shipments, plan inventory batches (sea freight), then reconcile each against the forwarder’s invoice. Estimates are kept once a shipment is booked." />
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="ok">{notice}</Alert>}

      {can.manage && (
        <form onSubmit={createShipment} className={`${card} mb-6 grid grid-cols-2 gap-3 md:grid-cols-6`}>
          <Input name="reference" label="Reference" placeholder="e.g. AIR-2611" value={create.reference} onChange={(n, v) => setCreate((c) => ({ ...c, [n]: v }))} />
          <label className={label}>Type
            <select value={create.kind} onChange={(e) => setCreate((c) => ({ ...c, kind: e.target.value, method: e.target.value === 'orders' ? 'air' : 'sea', allocation_method: e.target.value === 'orders' ? 'chargeable_weight' : 'volume' }))} className={`${field} mt-1`}>
              <option value="orders">Customer orders (air)</option><option value="inventory">Inventory batch</option>
            </select>
          </label>
          <label className={label}>Method
            <select value={create.method} disabled={create.kind === 'orders'} onChange={(e) => setCreate((c) => ({ ...c, method: e.target.value }))} className={`${field} mt-1`}>
              <option value="air">Air</option><option value="sea">Sea</option>
            </select>
          </label>
          <label className={label}>Rate
            <select value={create.rate_id} onChange={(e) => setCreate((c) => ({ ...c, rate_id: e.target.value }))} className={`${field} mt-1`}>
              <option value="">None yet</option>
              {data?.rates.filter((r: any) => r.method === create.method).map((r: any) => <option key={r.id} value={r.id}>{r.provider} from {r.effective_from}</option>)}
            </select>
          </label>
          <label className={label}>Allocation
            <select value={create.allocation_method} onChange={(e) => setCreate((c) => ({ ...c, allocation_method: e.target.value }))} className={`${field} mt-1`}>
              {ALLOCATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button type="submit" disabled={!create.reference.trim()} className={button}>New shipment</button></div>
        </form>
      )}

      {data?.unassigned?.length > 0 && (
        <section className={`${card} mb-6`}>
          <h2 className="font-semibold">Paid orders waiting for a shipment ({data.unassigned.length})</h2>
          <ul className="mt-3 max-h-64 divide-y divide-final-off-white/5 overflow-auto text-sm">
            {data.unassigned.map((o: any) => (
              <li key={o.id} className="flex items-center gap-3 py-1.5">
                {can.manage && <input type="checkbox" aria-label={`Pick ${o.order_number}`} checked={picked.includes(o.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id)))} />}
                <span className="flex-1">{o.order_number} <span className="text-xs text-final-muted">{o.status} · {new Date(o.created_at).toLocaleDateString('en-NG')}</span></span>
                <span className="text-xs tabular-nums text-final-muted">{kg(o.chargeableKg)} · est. {naira(o.freightKobo)}</span>
              </li>
            ))}
          </ul>
          {can.manage && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <select aria-label="Shipment" value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} max-w-xs`}>
                <option value="">Choose a shipment</option>
                {openOrderShipments.map((s: any) => <option key={s.id} value={s.id}>{s.reference}</option>)}
              </select>
              <button type="button" className={button} disabled={!picked.length || !target} onClick={async () => { await run({ id: target, action: 'add_orders', orderIds: picked }, `Added ${picked.length} orders.`); setPicked([]) }}>
                Add {picked.length || ''} to shipment
              </button>
            </div>
          )}
        </section>
      )}

      {data && data.shipments.length === 0 && <p className="text-sm text-final-muted">No shipments yet.</p>}
      <div className="space-y-6">
        {data?.shipments.map((s: any) => <Shipment key={s.id} s={s} can={can} rates={data.rates} products={products} run={run} />)}
      </div>
    </div>
  )
}

function Shipment({ s, can, rates, products, run }: { s: any; can: any; rates: any[]; products: { id: string; name: string }[]; run: (b: Record<string, unknown>, done?: string) => Promise<any> }) {
  const [line, setLine] = useState(BLANK_LINE)
  const [invoice, setInvoice] = useState(BLANK_INVOICE)
  const [receive, setReceive] = useState<Record<string, string>>({})
  const [opts, setOpts] = useState({ drawFromReserve: false, surplusToReserve: true, confirm: false })
  const [preview, setPreview] = useState<any>(null)
  const done = s.status === 'reconciled'
  const editable = can.manage && !done && s.status !== 'cancelled'
  const rec = s.reconciliation

  return (
    <article className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{s.reference} <span className="ml-1 text-xs font-normal uppercase tracking-[0.12em] text-final-muted">{s.method} · {s.kind === 'orders' ? 'orders' : 'inventory'}</span></h2>
        <Pill value={done ? 'verified' : s.status === 'cancelled' ? 'missing_data' : 'estimated'}>{s.status.replace('_', ' ')}</Pill>
      </div>
      <p className="mt-1 text-sm text-final-muted">
        Estimate {naira(s.estimated_cost == null ? null : Math.round(Number(s.estimated_cost) * 100))}
        {s.estimated_units != null && ` for ${s.estimated_units} ${s.method === 'sea' && s.kind === 'inventory' ? 'units billed' : 'kg'}`}
        {s.estimated_at ? ` · worked out ${new Date(s.estimated_at).toLocaleDateString('en-NG')}` : ' · not estimated yet'}
        {s.estimate?.shipment?.minApplied && ' · minimum charge applies'}
      </p>

      {editable && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <label className={label}>Status
            <select value={s.status} onChange={(e) => run({ id: s.id, action: 'update', status: e.target.value })} className={`${field} mt-1`}>
              {STATUSES.map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className={label}>Rate
            <select value={s.rate_id ?? ''} disabled={s.status !== 'planning'} onChange={(e) => run({ id: s.id, action: 'update', rate_id: e.target.value || null })} className={`${field} mt-1`}>
              <option value="">None</option>
              {rates.filter((r) => r.method === s.method).map((r) => <option key={r.id} value={r.id}>{r.provider} from {r.effective_from}</option>)}
            </select>
          </label>
          <label className={label}>Allocation
            <select value={s.allocation_method} onChange={(e) => run({ id: s.id, action: 'update', allocation_method: e.target.value })} className={`${field} mt-1`}>
              {ALLOCATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={label}>Dispatched<input type="date" defaultValue={s.dispatched_on ?? ''} onBlur={(e) => e.target.value !== (s.dispatched_on ?? '') && run({ id: s.id, action: 'update', dispatched_on: e.target.value || null })} className={`${field} mt-1`} /></label>
          <label className={label}>Arrived<input type="date" defaultValue={s.arrived_on ?? ''} onBlur={(e) => e.target.value !== (s.arrived_on ?? '') && run({ id: s.id, action: 'update', arrived_on: e.target.value || null })} className={`${field} mt-1`} /></label>
          <div className="flex items-end">
            <button type="button" className={ghost} disabled={s.status !== 'planning'} onClick={() => run({ id: s.id, action: 'estimate' }, 'Estimate worked out.')}>Work out estimate</button>
          </div>
        </div>
      )}

      {s.kind === 'orders' && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold">Orders ({s.orders.length})</h3>
          {s.orders.length === 0 ? <p className="mt-1 text-sm text-final-muted">Add paid orders from the list above.</p> : (
            <ul className="mt-2 divide-y divide-final-off-white/5 text-sm">
              {s.orders.map((o: any) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span>{o.order_number} <span className="text-xs text-final-muted">{o.status}</span></span>
                  <span className="flex items-center gap-3 text-xs tabular-nums text-final-muted">{kg(o.chargeableKg)} · est. {naira(o.freightKobo)}
                    {editable && <button type="button" className="text-final-ember underline" onClick={() => run({ id: s.id, action: 'remove_order', orderId: o.id })}>Remove</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {s.kind === 'inventory' && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold">Products in this batch</h3>
          <ul className="mt-2 divide-y divide-final-off-white/5 text-sm">
            {s.lines.map((l: any) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>{l.products?.name ?? l.product_id} <span className="text-xs text-final-muted">· {l.quantity_received}/{l.quantity_ordered} received{l.unit_cost != null ? ` · ${l.cost_currency} ${l.unit_cost}` : ''}{l.unit_cbm ? ` · ${l.unit_cbm} m³` : ''}{l.unit_weight_kg ? ` · ${kg(Number(l.unit_weight_kg))}` : ''}</span></span>
                <span className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-final-muted">
                  {l.estimated_landed_unit != null && <>est. landed {naira(Math.round(Number(l.estimated_landed_unit) * 100))}/unit</>}
                  {l.reconciled_landed_unit != null && <strong className="text-final-off-white">landed {naira(Math.round(Number(l.reconciled_landed_unit) * 100))}/unit</strong>}
                  {can.manage && s.status !== 'cancelled' && l.quantity_received < l.quantity_ordered && (
                    <>
                      <input aria-label="Units received" type="number" min="1" max={l.quantity_ordered - l.quantity_received} value={receive[l.id] ?? ''} onChange={(e) => setReceive((r) => ({ ...r, [l.id]: e.target.value }))} className={`${field} w-20`} />
                      <button type="button" className={ghost} disabled={!receive[l.id]} onClick={async () => { await run({ id: s.id, action: 'receive', lineId: l.id, quantity: Number(receive[l.id]), key: requestKey() }, 'Received into stock.'); setReceive((r) => ({ ...r, [l.id]: '' })) }}>Receive into stock</button>
                    </>
                  )}
                  {editable && !l.quantity_received && <button type="button" className="text-final-ember underline" onClick={() => run({ id: s.id, action: 'remove_line', lineId: l.id })}>Remove</button>}
                </span>
              </li>
            ))}
          </ul>
          {editable && (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-8">
              <label className={`${label} col-span-2`}>Product
                <select value={line.product_id} onChange={(e) => setLine((x) => ({ ...x, product_id: e.target.value }))} className={`${field} mt-1`}>
                  <option value="">Choose</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              {(['quantity_ordered', 'unit_cost'] as const).map((k) => <Input key={k} name={k} type="number" step="0.01" label={k === 'quantity_ordered' ? 'Quantity' : 'Unit cost'} value={line[k]} onChange={(n, v) => setLine((x) => ({ ...x, [n]: v }))} />)}
              <label className={label}>Currency<select value={line.cost_currency} onChange={(e) => setLine((x) => ({ ...x, cost_currency: e.target.value }))} className={`${field} mt-1`}>{['CNY', 'USD', 'NGN'].map((c) => <option key={c}>{c}</option>)}</select></label>
              {line.cost_currency !== 'NGN' && <Input name="fx_rate" type="number" step="0.000001" label="₦ per unit" value={line.fx_rate} onChange={(n, v) => setLine((x) => ({ ...x, [n]: v }))} />}
              <Input name="unit_weight_kg" type="number" step="0.001" label="Unit kg" value={line.unit_weight_kg} onChange={(n, v) => setLine((x) => ({ ...x, [n]: v }))} />
              <Input name="unit_cbm" type="number" step="0.000001" label="Unit m³" value={line.unit_cbm} onChange={(n, v) => setLine((x) => ({ ...x, [n]: v }))} />
              <div className="flex items-end"><button type="button" className={ghost} disabled={!line.product_id || !line.quantity_ordered} onClick={async () => { if (await run({ id: s.id, action: 'add_line', ...line })) setLine(BLANK_LINE) }}>Add</button></div>
            </div>
          )}
        </section>
      )}

      <section className="mt-5">
        <h3 className="text-sm font-semibold">Freight invoices</h3>
        <ul className="mt-2 divide-y divide-final-off-white/5 text-sm">
          {s.invoices.map((i: any) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>{i.invoice_ref ?? 'Invoice'} {i.invoice_date && <span className="text-xs text-final-muted">{i.invoice_date}</span>} {i.document_url && <a href={i.document_url} target="_blank" rel="noreferrer" className="text-xs underline">document</a>}</span>
              <span className="flex items-center gap-3 text-xs tabular-nums text-final-muted">
                {i.currency !== 'NGN' && `${i.currency} at ${i.fx_rate} · `}{naira(Math.round(Number(i.total_ngn) * 100))}{i.chargeable_actual != null && ` · billed ${i.chargeable_actual}`}
                {editable && <button type="button" className="text-final-ember underline" onClick={() => run({ id: s.id, action: 'remove_invoice', invoiceId: i.id })}>Remove</button>}
              </span>
            </li>
          ))}
        </ul>
        {editable && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-final-muted hover:text-final-off-white">Enter an invoice</summary>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-6">
              <Input name="invoice_ref" label="Invoice number" value={invoice.invoice_ref} onChange={(n, v) => setInvoice((x) => ({ ...x, [n]: v }))} />
              <Input name="invoice_date" type="date" label="Date" value={invoice.invoice_date} onChange={(n, v) => setInvoice((x) => ({ ...x, [n]: v }))} />
              <label className={label}>Currency<select value={invoice.currency} onChange={(e) => setInvoice((x) => ({ ...x, currency: e.target.value }))} className={`${field} mt-1`}>{['NGN', 'USD', 'CNY'].map((c) => <option key={c}>{c}</option>)}</select></label>
              {invoice.currency !== 'NGN' && <Input name="fx_rate" type="number" step="0.000001" label="₦ per unit (applied)" value={invoice.fx_rate} onChange={(n, v) => setInvoice((x) => ({ ...x, [n]: v }))} />}
              <Input name="chargeable_actual" type="number" step="0.001" label="Billed kg or m³" value={invoice.chargeable_actual} onChange={(n, v) => setInvoice((x) => ({ ...x, [n]: v }))} />
              {([['freight_amount', 'Freight'], ['additional_fees', 'Additional fees'], ['clearance_charges', 'Clearance and customs'], ['insurance', 'Insurance'], ['handling', 'Handling'], ['other_costs', 'Other']] as const).map(([k, l]) => (
                <Input key={k} name={k} type="number" step="0.01" label={l} value={invoice[k]} onChange={(n, v) => setInvoice((x) => ({ ...x, [n]: v }))} />
              ))}
              <Input name="document_url" type="url" label="Invoice link" className="col-span-2" value={invoice.document_url} onChange={(n, v) => setInvoice((x) => ({ ...x, [n]: v }))} />
              <div className="flex items-end"><button type="button" className={ghost} onClick={async () => { if (await run({ id: s.id, action: 'add_invoice', ...invoice })) setInvoice(BLANK_INVOICE) }}>Save invoice</button></div>
            </div>
          </details>
        )}
      </section>

      {rec ? (
        <section className="mt-5 rounded-lg bg-final-black/40 p-4 text-sm">
          <h3 className="font-semibold">Reconciled {new Date(rec.finalized_at).toLocaleDateString('en-NG')}</h3>
          <p className="mt-1 tabular-nums text-final-muted">
            Estimated {naira(rec.estimated_cost == null ? null : Math.round(Number(rec.estimated_cost) * 100))} · actual {naira(Math.round(Number(rec.actual_cost) * 100))}
            {rec.variance != null && ` · ${naira(Math.round(Number(rec.variance) * 100), { sign: true })} (${pct(rec.variance_pct == null ? null : Number(rec.variance_pct))})`}
            {s.kind === 'orders' && <> · recovered {naira(Math.round(Number(rec.recovered) * 100))} · subsidies {naira(Math.round(Number(rec.subsidies) * 100))} · from reserve {naira(Math.round(Number(rec.reserve_drawn) * 100))} · <strong className="text-final-off-white">unfunded {naira(Math.round(Number(rec.unfunded) * 100))}</strong></>}
          </p>
        </section>
      ) : s.invoices.length > 0 && s.status !== 'cancelled' && (
        <section className="mt-5 rounded-lg border border-final-off-white/10 p-4 text-sm">
          <h3 className="font-semibold">Reconcile</h3>
          {s.kind === 'orders' && (
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.drawFromReserve} onChange={(e) => { setOpts((o) => ({ ...o, drawFromReserve: e.target.checked })); setPreview(null) }} /> Cover a shortfall from the logistics reserve</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.surplusToReserve} onChange={(e) => { setOpts((o) => ({ ...o, surplusToReserve: e.target.checked })); setPreview(null) }} /> Put a surplus in the reserve</label>
            </div>
          )}
          <button type="button" className={`${ghost} mt-3`} onClick={async () => { const r = await run({ id: s.id, action: 'preview', ...opts }); if (r) setPreview(r.preview) }}>Compare with the estimate</button>
          {preview && (
            <div className="mt-3 space-y-1 tabular-nums">
              <p>Estimated {naira(preview.estimatedKobo)} · actual {naira(preview.actualKobo)}{preview.varianceKobo != null && <> · difference {naira(preview.varianceKobo, { sign: true })}{preview.variancePct != null && ` (${preview.variancePct}%)`}</>}</p>
              {preview.kind === 'orders' ? (
                <>
                  <p>Recovered by contributions {naira(preview.recoveredKobo)} · subsidies {naira(preview.subsidyKobo)} · {pct(preview.recoveryPct)} of the actual cost</p>
                  <p>From the reserve {naira(preview.reserveDrawKobo)} · surplus to the reserve {naira(preview.surplusToReserveKobo)} · <strong>unfunded {naira(preview.unfundedKobo)}</strong></p>
                </>
              ) : (
                <ul className="mt-2 text-xs text-final-muted">
                  {preview.lines.map((l: any) => <li key={l.id}>{l.productId}: costs {naira(l.allocatedKobo)} · landed {naira(l.landedPerUnitKobo)} per {l.perUnitBasis} unit{l.shortfall ? ` · ${l.shortfall} short` : ''}</li>)}
                </ul>
              )}
              {can.finalize ? (
                <div className="mt-3">
                  <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={opts.confirm} onChange={(e) => setOpts((o) => ({ ...o, confirm: e.target.checked }))} /> These figures are final. The estimate stays on record beside them; nothing can be changed afterwards.</label>
                  <button type="button" className={`${button} mt-2`} disabled={!opts.confirm} onClick={async () => { if (await run({ id: s.id, action: 'finalize', ...opts }, 'Reconciled.')) setPreview(null) }}>Finalise reconciliation</button>
                </div>
              ) : <p className="mt-2 text-xs text-final-muted">Finance (finance.adjust) finalises reconciliations.</p>}
            </div>
          )}
        </section>
      )}
    </article>
  )
}
