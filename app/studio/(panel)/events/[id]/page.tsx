'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils/format'
import { showCode } from '@/lib/events'
import { api, btn, date, field, label } from '../../outbox/api'

type Status = 'draft' | 'published' | 'cancelled'
type Event = {
  id: string; slug: string; title: string; description: string; venue: string; address: string; image_url: string | null
  starts_at: string; ends_at: string | null; sales_open_at: string | null; sales_close_at: string | null
  sales_paused: boolean; max_per_order: number; terms: string; status: Status
}
type Tier = { id: string; name: string; description: string; price: number | string; capacity: number; sort: number; active: boolean }
type Seat = { ticket_type_id: string; capacity: number; sold: number; held: number; free: number }
type Ticket = { id: string; code: string; status: 'valid' | 'checked_in' | 'void'; checked_in_at: string | null; ticket_type_id: string }
type Order = {
  id: string; order_number: string; name: string; email: string; phone: string | null; total: string; discount: string; promo_code: string | null
  status: 'confirmed' | 'cancelled'; payment_status: 'paid' | 'refunded'; capacity_shortfall: Record<string, unknown> | null; cancel_reason: string | null
  created_at: string; tickets: Ticket[]
}
type DoorLink = { id: string; label: string; expires_at: string; revoked_at: string | null; checkins: number; last_used_at: string | null; created_at: string }
type Detail = { event: Event; tiers: Tier[]; seats: Seat[]; orders: Order[]; doorLinks: DoorLink[]; can: { refund: boolean; checkIn: boolean } }

// Lagos is UTC+1 all year: datetime-local fields hold Lagos time.
const toInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 3_600_000).toISOString().slice(0, 16) : '')
const card = 'rounded-xl border border-final-off-white/10 bg-final-gray p-5'
const emptyTier = { name: '', description: '', price: '', capacity: '', sort: '', active: true }

export default function EventPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Record<string, string | number>>({})
  const [tier, setTier] = useState<typeof emptyTier>(emptyTier)
  const [editing, setEditing] = useState<Record<string, Record<string, string | number | boolean>>>({})
  const [search, setSearch] = useState('')
  const [door, setDoor] = useState({ label: '', hours: '' })
  const [newLink, setNewLink] = useState<{ url: string; qr: string; label: string } | null>(null)
  // Asked on the page, not with confirm()/prompt(), which some browsers block (and then answer "no").
  // `reason` asks for a short reason too, kept with the record.
  const [ask, setAsk] = useState<{ text: string; confirm: string; reason?: boolean; run: (reason: string) => Promise<unknown>; done?: string } | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<Detail>(`/api/admin/events/${params.id}`)
      setD(data)
      const e = data.event
      setForm({
        title: e.title, slug: e.slug, description: e.description, venue: e.venue, address: e.address, image_url: e.image_url ?? '',
        starts_at: toInput(e.starts_at), ends_at: toInput(e.ends_at), sales_open_at: toInput(e.sales_open_at), sales_close_at: toInput(e.sales_close_at),
        max_per_order: e.max_per_order, terms: e.terms,
      })
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }, [params.id])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
      if (done) setNotice(done)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }
  const put = (body: Record<string, unknown>) => api(`/api/admin/events/${params.id}`, { method: 'PUT', body: JSON.stringify(body) })
  const orderAction = (body: Record<string, unknown>) => api(`/api/admin/events/${params.id}/orders`, { method: 'POST', body: JSON.stringify(body) })

  const seatOf = useMemo(() => new Map((d?.seats ?? []).map((s) => [s.ticket_type_id, s])), [d])
  const tierName = useMemo(() => new Map((d?.tiers ?? []).map((t) => [t.id, t.name])), [d])
  const totals = useMemo(() => {
    const live = (d?.orders ?? []).filter((o) => o.status === 'confirmed')
    const tickets = live.flatMap((o) => o.tickets.filter((t) => t.status !== 'void'))
    return {
      sold: tickets.length,
      inside: tickets.filter((t) => t.status === 'checked_in').length,
      capacity: (d?.tiers ?? []).filter((t) => t.active).reduce((s, t) => s + t.capacity, 0),
      held: (d?.seats ?? []).reduce((s, x) => s + Number(x.held), 0),
      revenue: live.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + Number(o.total), 0),
      flagged: (d?.orders ?? []).filter((o) => o.capacity_shortfall && o.status === 'confirmed').length,
    }
  }, [d])
  const orders = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\s/g, '')
    if (!q) return d?.orders ?? []
    return (d?.orders ?? []).filter((o) => [o.name, o.email, o.order_number, ...o.tickets.map((t) => t.code)].some((v) => v.toLowerCase().replace(/\s/g, '').includes(q)))
  }, [d, search])

  if (!d) return <div className="mx-auto max-w-4xl px-4 pt-10">{error ? <p role="alert" className="text-final-ember">{error}</p> : <div className="skeleton h-40 rounded-xl" />}</div>
  const e = d.event
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: ev.target.value }))

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <Link href="/studio/events" className="text-sm text-final-muted hover:text-final-off-white">← Events</Link>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="display text-3xl md:text-4xl">{e.title}</h1>
        <p className="text-xs uppercase tracking-[0.12em] text-final-muted">
          {e.status === 'published' ? (e.sales_paused ? 'Paused' : 'On sale') : e.status === 'draft' ? 'Draft' : 'Cancelled'}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {e.status === 'draft' && <button disabled={busy} onClick={() => act(() => put({ status: 'published' }), 'Published. Tickets are on sale from the sales opening time.')} className="btn-primary px-4 py-2">Publish</button>}
        {e.status === 'published' && <button disabled={busy} onClick={() => act(() => put({ sales_paused: !e.sales_paused }))} className="btn-secondary px-4 py-2">{e.sales_paused ? 'Resume sales' : 'Pause sales'}</button>}
        {e.status !== 'cancelled' && <a href={`/events/${e.slug}`} target="_blank" rel="noreferrer" className="btn-secondary px-4 py-2">View page</a>}
        {e.status === 'published' && d.can.checkIn && <a href={`/door?event=${e.id}`} target="_blank" rel="noreferrer" className="btn-secondary px-4 py-2">Open the door</a>}
        {e.status !== 'cancelled' && (
          <button disabled={busy} onClick={() => setAsk({ text: 'Cancel this event? Sales stop at once and it can’t be reopened. Refund each order below.', confirm: 'Cancel event', run: () => put({ status: 'cancelled' }) })}
            className={`${btn} border border-final-off-white/15 text-final-muted hover:text-final-ember`}>Cancel event</button>
        )}
        {e.status === 'draft' && (
          <button disabled={busy} onClick={() => setAsk({ text: 'Delete this draft? Its tickets and details go with it.', confirm: 'Delete draft', run: async () => { await api(`/api/admin/events/${e.id}`, { method: 'DELETE' }); router.push('/studio/events') } })}
            className={`${btn} border border-final-off-white/15 text-final-muted hover:text-final-ember`}>Delete draft</button>
        )}
      </div>

      {error && <div role="alert" className="mt-4 rounded-lg border border-final-ember/40 p-4 text-sm text-final-ember">{error}</div>}
      {notice && <div role="status" className="mt-4 rounded-lg border border-final-off-white/15 p-4 text-sm">{notice}</div>}

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        {([['Sold', `${totals.sold} of ${totals.capacity}`], ['Checked in', totals.inside], ['Being paid for', totals.held], ['Taken', formatCurrency(totals.revenue)], ['To check', totals.flagged]] as const).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-final-off-white/10 bg-final-black px-3 py-2">
            <dt className="text-xs text-final-muted">{k}</dt><dd className={`mt-0.5 font-semibold tabular-nums ${k === 'To check' && totals.flagged ? 'text-final-ember' : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>

      {/* Tiers */}
      <section className={`${card} mt-8`} aria-labelledby="tiers-h">
        <h2 id="tiers-h" className="font-semibold">Tickets</h2>
        <p className="mt-1 text-sm text-final-muted">Changing a price affects new buyers only. Lowering a capacity never cancels tickets already sold.</p>
        <ul className="mt-4 space-y-3">
          {d.tiers.map((t) => {
            const s = seatOf.get(t.id)
            const draft = editing[t.id]
            return (
              <li key={t.id} className="rounded-lg border border-final-off-white/10 bg-final-black p-4">
                {draft ? (
                  <form onSubmit={(ev) => { ev.preventDefault(); act(async () => { await api(`/api/admin/events/${e.id}/tiers`, { method: 'PUT', body: JSON.stringify({ id: t.id, ...draft }) }); setEditing(({ [t.id]: _gone, ...rest }) => rest) }) }}
                    className="grid gap-3 sm:grid-cols-4">
                    <input required aria-label="Name" value={String(draft.name)} onChange={(ev) => setEditing({ ...editing, [t.id]: { ...draft, name: ev.target.value } })} className={`${field} sm:col-span-2`} />
                    <input required aria-label="Price (₦)" type="number" min="100" step="0.01" value={String(draft.price)} onChange={(ev) => setEditing({ ...editing, [t.id]: { ...draft, price: ev.target.value } })} className={field} />
                    <input required aria-label="Capacity" type="number" min="1" value={String(draft.capacity)} onChange={(ev) => setEditing({ ...editing, [t.id]: { ...draft, capacity: ev.target.value } })} className={field} />
                    <input aria-label="Description" value={String(draft.description)} onChange={(ev) => setEditing({ ...editing, [t.id]: { ...draft, description: ev.target.value } })} placeholder="What it includes (optional)" className={`${field} sm:col-span-3`} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.active)} onChange={(ev) => setEditing({ ...editing, [t.id]: { ...draft, active: ev.target.checked } })} /> On sale</label>
                    <div className="flex gap-2 sm:col-span-4">
                      <button type="submit" disabled={busy} className="btn-primary px-4 py-2">Save</button>
                      <button type="button" onClick={() => setEditing(({ [t.id]: _gone, ...rest }) => rest)} className="btn-secondary px-4 py-2">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium">{t.name} <span className="ml-1 text-sm font-normal text-final-muted">{formatCurrency(t.price)}</span>{!t.active && <span className="ml-2 text-xs uppercase tracking-[0.12em] text-final-muted">Off sale</span>}</p>
                      <p className="text-sm text-final-muted">{s ? `${s.sold} sold · ${s.held} being paid for · ${s.free} free of ${s.capacity}` : `${t.capacity} seats`}</p>
                    </div>
                    <button onClick={() => setEditing({ ...editing, [t.id]: { name: t.name, description: t.description, price: String(t.price), capacity: t.capacity, sort: t.sort, active: t.active } })} className="btn-secondary px-3 py-1.5 text-sm">Edit</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {e.status !== 'cancelled' && (
          <form onSubmit={(ev) => { ev.preventDefault(); act(async () => { await api(`/api/admin/events/${e.id}/tiers`, { method: 'POST', body: JSON.stringify({ ...tier, sort: d.tiers.length }) }); setTier(emptyTier) }) }}
            className="mt-4 grid gap-3 border-t border-final-off-white/10 pt-4 sm:grid-cols-4">
            <label className="sm:col-span-2"><span className={label}>New ticket</span><input required maxLength={60} value={tier.name} onChange={(ev) => setTier({ ...tier, name: ev.target.value })} placeholder="Regular" className={field} /></label>
            <label><span className={label}>Price (₦)</span><input required type="number" min="100" step="0.01" value={tier.price} onChange={(ev) => setTier({ ...tier, price: ev.target.value })} className={field} /></label>
            <label><span className={label}>Capacity</span><input required type="number" min="1" value={tier.capacity} onChange={(ev) => setTier({ ...tier, capacity: ev.target.value })} className={field} /></label>
            <label className="sm:col-span-3"><span className={label}>Includes (optional)</span><input maxLength={300} value={tier.description} onChange={(ev) => setTier({ ...tier, description: ev.target.value })} placeholder="Entry and a welcome drink" className={field} /></label>
            <div className="self-end"><button type="submit" disabled={busy} className="btn-primary w-full px-4 py-2">Add ticket</button></div>
          </form>
        )}
      </section>

      {/* Details */}
      <form onSubmit={(ev) => { ev.preventDefault(); act(() => put(form), 'Saved.') }} className={`${card} mt-8`} aria-labelledby="details-h">
        <h2 id="details-h" className="font-semibold">Details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className={label}>Title</span><input required maxLength={120} value={String(form.title ?? '')} onChange={set('title')} className={field} /></label>
          <label><span className={label}>Address on the site</span><input required maxLength={60} value={String(form.slug ?? '')} onChange={set('slug')} className={`${field} font-mono`} /><span className="mt-1 block text-xs text-final-muted">/events/{String(form.slug ?? '')}</span></label>
          <label><span className={label}>Image link (optional)</span><input maxLength={500} value={String(form.image_url ?? '')} onChange={set('image_url')} placeholder="https://…" className={field} /></label>
          <label><span className={label}>Starts (Lagos time)</span><input required type="datetime-local" value={String(form.starts_at ?? '')} onChange={set('starts_at')} className={field} /></label>
          <label><span className={label}>Ends (optional)</span><input type="datetime-local" value={String(form.ends_at ?? '')} onChange={set('ends_at')} className={field} /></label>
          <label><span className={label}>Sales open (empty: when published)</span><input type="datetime-local" value={String(form.sales_open_at ?? '')} onChange={set('sales_open_at')} className={field} /></label>
          <label><span className={label}>Sales close (empty: when it starts)</span><input type="datetime-local" value={String(form.sales_close_at ?? '')} onChange={set('sales_close_at')} className={field} /></label>
          <label><span className={label}>Venue</span><input maxLength={200} value={String(form.venue ?? '')} onChange={set('venue')} className={field} /></label>
          <label><span className={label}>Address</span><input maxLength={300} value={String(form.address ?? '')} onChange={set('address')} className={field} /></label>
          <label><span className={label}>Tickets per order</span><input type="number" min="1" max="20" value={String(form.max_per_order ?? 6)} onChange={set('max_per_order')} className={field} /></label>
          <label className="sm:col-span-2"><span className={label}>Description</span><textarea rows={5} maxLength={4000} value={String(form.description ?? '')} onChange={set('description')} className={field} /></label>
          <label className="sm:col-span-2"><span className={label}>Ticket terms (empty: the standard wording)</span><textarea rows={3} maxLength={2000} value={String(form.terms ?? '')} onChange={set('terms')} className={field} /></label>
        </div>
        <button type="submit" disabled={busy || e.status === 'cancelled'} className="btn-primary mt-4 px-5 py-2 disabled:opacity-50">Save details</button>
      </form>

      {/* Orders */}
      <section className={`${card} mt-8`} aria-labelledby="orders-h">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="orders-h" className="font-semibold">Guests <span className="font-normal text-final-muted">({d.orders.length} orders)</span></h2>
          <input value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder="Name, email or code" aria-label="Search guests" className={`${field} max-w-xs`} />
        </div>
        {!orders.length && <p className="mt-4 text-sm text-final-muted">{d.orders.length ? 'Nobody matches.' : 'No tickets sold yet.'}</p>}
        <ul className="mt-4 divide-y divide-final-off-white/10">
          {orders.map((o) => (
            <li key={o.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{o.name} <span className="text-sm font-normal text-final-muted">{o.email}{o.phone ? ` · ${o.phone}` : ''}</span></p>
                <p className="text-sm tabular-nums">{formatCurrency(o.total)}{o.promo_code ? <span className="text-final-muted"> · {o.promo_code}</span> : null}</p>
              </div>
              <p className="mt-0.5 text-xs text-final-muted">{o.order_number} · {date(o.created_at)}
                {o.status === 'cancelled' && ` · Cancelled${o.payment_status === 'refunded' ? ', refunded' : ', not refunded yet'}${o.cancel_reason ? `: ${o.cancel_reason}` : ''}`}
              </p>
              {o.capacity_shortfall && o.status === 'confirmed' && (
                <p className="mt-1 text-sm text-final-ember">
                  {o.capacity_shortfall.event_cancelled ? 'Paid after the event was cancelled: refund it.' : 'Paid after this ticket sold out, so the venue is over capacity: refund it, or let them in.'}
                </p>
              )}
              <ul className="mt-2 flex flex-wrap gap-2">
                {o.tickets.map((t) => (
                  <li key={t.id} className={`rounded-md border px-2 py-1 font-mono text-xs ${t.status === 'checked_in' ? 'border-emerald-400/50' : t.status === 'void' ? 'border-final-off-white/10 text-final-muted line-through' : 'border-final-off-white/20'}`}>
                    {showCode(t.code)} · {tierName.get(t.ticket_type_id) ?? 'Ticket'}{t.status === 'checked_in' && t.checked_in_at ? ` · in ${date(t.checked_in_at)}` : ''}
                    {t.status === 'checked_in' && (
                      <button onClick={() => setAsk({ text: `Undo the check-in for ${showCode(t.code)}? The ticket will open the door again.`, confirm: 'Undo check-in', run: () => orderAction({ action: 'undo_check_in', ticket: t.id }) })} className="ml-2 underline">undo</button>
                    )}
                  </li>
                ))}
              </ul>
              {o.status === 'confirmed' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => setAsk({ text: `Cancel ${o.order_number} (${o.name})? Its tickets stop working at once.`, confirm: 'Cancel tickets', reason: true,
                    run: (why) => orderAction({ action: 'cancel', order: o.id, reason: why }), done: 'Cancelled. Refund it in Flutterwave, then record the refund.' })}
                    className="btn-secondary px-3 py-1.5 text-sm">Cancel tickets</button>
                  {d.can.refund && (
                    <button disabled={busy} onClick={() => setAsk({ text: `Cancel ${o.order_number} (${o.name}) and record that it was refunded in the Flutterwave dashboard? Its tickets stop working at once.`, confirm: 'Cancel and record refund', reason: true,
                      run: (why) => orderAction({ action: 'cancel', order: o.id, reason: why, refunded: true }) })}
                      className="btn-secondary px-3 py-1.5 text-sm">Cancel and record refund</button>
                  )}
                </div>
              )}
              {o.status === 'cancelled' && o.payment_status !== 'refunded' && d.can.refund && (
                <button disabled={busy} onClick={() => setAsk({ text: `Record that ${o.order_number} was refunded in the Flutterwave dashboard?`, confirm: 'Record refund',
                  run: () => orderAction({ action: 'cancel', order: o.id, reason: o.cancel_reason || 'refunded', refunded: true }) })}
                  className="btn-secondary mt-3 px-3 py-1.5 text-sm">Record refund</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Door links */}
      <section className={`${card} mt-8`} aria-labelledby="door-h">
        <h2 id="door-h" className="font-semibold">Door links</h2>
        <p className="mt-1 text-sm text-final-muted">
          For helpers without a Studio account. Open the link (or scan its QR code) on the helper’s phone once: it can then check tickets in for this event only,
          until it expires (12 hours after the event unless you say otherwise). Revoke it to stop it at once. Staff with check-in can use Open the door instead.
        </p>
        {newLink && (
          <div className="mt-4 rounded-lg border border-final-ember/40 bg-final-black p-4">
            <p className="text-sm font-medium">{newLink.label}: shown once. Scan it with the helper’s phone, or send them the link privately.</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {/* Generated on the server from the door link. */}
              <div className="w-40 overflow-hidden rounded-lg bg-white p-1 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: newLink.qr }} />
              <div className="min-w-0 flex-1">
                <code className="block break-all text-xs">{newLink.url}</code>
                <button onClick={() => navigator.clipboard?.writeText(newLink.url).then(() => setNotice('Link copied.'))} className="btn-secondary mt-2 px-3 py-1.5 text-sm">Copy link</button>
              </div>
            </div>
          </div>
        )}
        {e.status === 'published' && (
          <form onSubmit={(ev) => { ev.preventDefault(); act(async () => { const r = await api<{ url: string; qr: string; link: { label: string } }>(`/api/admin/events/${e.id}/door-links`, { method: 'POST', body: JSON.stringify(door) }); setNewLink({ url: r.url, qr: r.qr, label: r.link.label }); setDoor({ label: '', hours: '' }) }) }}
            className="mt-4 grid gap-3 sm:grid-cols-4">
            <label className="sm:col-span-2"><span className={label}>Who it’s for</span><input required maxLength={60} value={door.label} onChange={(ev) => setDoor({ ...door, label: ev.target.value })} placeholder="Front door: Tobi" className={field} /></label>
            <label><span className={label}>Hours (optional)</span><input type="number" min="1" max="336" value={door.hours} onChange={(ev) => setDoor({ ...door, hours: ev.target.value })} className={field} /></label>
            <div className="self-end"><button type="submit" disabled={busy} className="btn-primary w-full px-4 py-2">Make link</button></div>
          </form>
        )}
        <ul className="mt-4 divide-y divide-final-off-white/10 text-sm">
          {d.doorLinks.map((l) => {
            const live = !l.revoked_at && new Date(l.expires_at).getTime() > Date.now()
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{l.label} <span className={`ml-1 text-xs uppercase tracking-[0.12em] ${live ? 'text-final-ember' : 'text-final-muted'}`}>{l.revoked_at ? 'Revoked' : live ? 'Live' : 'Expired'}</span></p>
                  <p className="text-xs text-final-muted">{l.checkins} checked in · {live ? `until ${date(l.expires_at)}` : `ended ${date(l.revoked_at ?? l.expires_at)}`}{l.last_used_at ? ` · last used ${date(l.last_used_at)}` : ''}</p>
                </div>
                {live && <button disabled={busy} onClick={() => act(() => api(`/api/admin/events/${e.id}/door-links`, { method: 'PUT', body: JSON.stringify({ id: l.id }) }))} className="btn-secondary px-3 py-1.5 text-sm">Revoke</button>}
              </li>
            )
          })}
        </ul>
      </section>

      {ask && (
        <div role="alertdialog" aria-labelledby="ask-text" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-xl border border-final-ember/50 bg-final-black p-5 shadow-2xl shadow-black">
          <p id="ask-text" className="text-sm">{ask.text}</p>
          <form onSubmit={(ev) => { ev.preventDefault(); const { run, done } = ask; const why = reason.trim(); setAsk(null); setReason(''); act(() => run(why), done) }} className="mt-3 space-y-3">
            {ask.reason && (
              <label className="block"><span className={label}>Why (kept with the order)</span>
                <input required autoFocus maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)} className={field} placeholder="Asked for a refund" />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" autoFocus={!ask.reason} disabled={busy || (ask.reason && !reason.trim())} className="btn-primary px-4 py-2 disabled:opacity-40">{ask.confirm}</button>
              <button type="button" onClick={() => { setAsk(null); setReason('') }} className="btn-secondary px-4 py-2">Keep it</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
