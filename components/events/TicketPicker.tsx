'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FiMinus, FiPlus } from 'react-icons/fi'
import { formatCurrency } from '@/lib/utils/format'
import { priceLabel, type TicketQuoteJson } from '@/lib/events'
import { SquishyCard, type SquishyShape, type SquishyTone } from '@/components/ui/SquishyCard'

/** Where the event page leaves the buyer's email for /events/complete, which shows the tickets only to them. */
export const PENDING_TICKETS_KEY = 'fh_tickets_pending'

type Tier = { id: string; name: string; description: string; price: string; free: number }

const TONES: SquishyTone[] = ['concrete', 'ember', 'bone']
const SHAPES: SquishyShape[] = ['orbs', 'blocks', 'chevrons']
const field = 'w-full rounded-[4px] border border-final-off-white/15 bg-final-black px-3 py-2.5 text-sm text-final-off-white placeholder:text-final-muted/70 focus:border-final-off-white/40 focus:outline-none'
const bar = 'flex h-12 w-full items-center rounded-[4px] bg-white font-mono font-black uppercase text-neutral-900'

/**
 * Choosing tickets and paying. Every price shown comes from the server's quote
 * (/api/events/<slug>/quote); the browser's numbers are never sent as prices.
 */
export function TicketPicker({ slug, tiers, maxPerOrder, terms }: { slug: string; tiers: Tier[]; maxPerOrder: number; terms: string }) {
  const [qty, setQty] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [hasCode, setHasCode] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [quote, setQuote] = useState<TicketQuoteJson | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)

  const count = Object.values(qty).reduce((s, n) => s + n, 0)
  const items = useMemo(() => Object.entries(qty).filter(([, n]) => n > 0).map(([id, quantity]) => ({ id, quantity })), [qty])
  const codeToCheck = code.trim()
  const emailToCheck = codeToCheck && email.includes('@') ? email.trim() : ''

  // Re-quote when the tickets, the code or (with a code) the email change.
  useEffect(() => {
    if (!items.length) return setQuote(null)
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/events/${slug}/quote`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, code: codeToCheck || undefined, email: emailToCheck || undefined }),
        })
        const data = await res.json().catch(() => null)
        if (mine !== seq.current) return
        if (res.ok && data) setQuote(data)
        else setError(data?.error || 'We couldn’t price these tickets. Try again.')
      } catch {
        if (mine === seq.current) setError('We couldn’t reach the shop. Check your connection.')
      }
    }, 300)
    return () => clearTimeout(t)
  }, [slug, items, codeToCheck, emailToCheck])

  const change = (tier: Tier, by: number) => {
    setError('')
    setQty((q) => {
      const now = q[tier.id] ?? 0
      const others = count - now
      return { ...q, [tier.id]: Math.max(0, Math.min(now + by, tier.free, maxPerOrder - others)) }
    })
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault()
    if (!quote?.ok) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/events/${slug}/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, name, email, phone, code: codeToCheck || undefined, terms: agreed }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && typeof data.paymentUrl === 'string') {
        try { sessionStorage.setItem(PENDING_TICKETS_KEY, JSON.stringify({ email: email.trim(), event: slug })) } catch { /* the email has the tickets too */ }
        return window.location.assign(data.paymentUrl)
      }
      setError(data.error || 'We couldn’t start the payment. Please try again.')
    } catch {
      setError('We couldn’t reach the shop. Check your connection and try again.')
    }
    setBusy(false)
  }

  const canPay = Boolean(quote?.ok) && name.trim() && email.includes('@') && phone.replace(/\D/g, '').length >= 7 && agreed && !busy

  return (
    <form onSubmit={pay}>
      {/* One fixed price is one card, centred; more tiers sit side by side. */}
      <ul className={tiers.length === 1 ? 'flex justify-center' : `grid justify-items-center gap-6 sm:grid-cols-2 ${tiers.length > 2 ? 'lg:grid-cols-3' : ''}`}>
        {tiers.map((t, i) => {
          const n = qty[t.id] ?? 0
          const soldOut = t.free === 0
          const full = count >= maxPerOrder
          return (
            <li key={t.id} className="flex w-full justify-center">
              <SquishyCard label={t.name} price={priceLabel(t.price)} tone={TONES[i % 3]} shape={SHAPES[i % 3]} active={n > 0} dimmed={soldOut}
                note={soldOut ? 'Sold out' : t.free <= 10 ? `Only ${t.free} left` : 'One person, one entry'} description={t.description || undefined}>
                {n === 0 ? (
                  <button type="button" onClick={() => change(t, 1)} disabled={soldOut || full}
                    className={`${bar} justify-center transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60`}>
                    {soldOut ? 'Sold out' : full ? `Max ${maxPerOrder} per order` : 'Choose'}
                  </button>
                ) : (
                  <div className={`${bar} justify-between px-1.5`}>
                    <button type="button" onClick={() => change(t, -1)} aria-label={`One fewer ${t.name} ticket`} className="grid h-9 w-9 place-items-center rounded-[3px] hover:bg-black/10"><FiMinus aria-hidden /></button>
                    <span className="tabular-nums" aria-live="polite">{n} × {t.name}</span>
                    <button type="button" onClick={() => change(t, 1)} disabled={n >= t.free || full} aria-label={`One more ${t.name} ticket`}
                      className="grid h-9 w-9 place-items-center rounded-[3px] hover:bg-black/10 disabled:opacity-30"><FiPlus aria-hidden /></button>
                  </div>
                )}
              </SquishyCard>
            </li>
          )
        })}
      </ul>
      <p className="mt-6 text-center font-mono text-xs uppercase tracking-[0.18em] text-final-muted">
        Up to {maxPerOrder} per order · each ticket gets its own QR code
      </p>

      {count > 0 && (
        <div className="mx-auto mt-12 grid max-w-4xl gap-8 rounded-[6px] border border-final-off-white/10 bg-final-gray p-6 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-final-muted">Who’s coming</h3>
            <label className="block text-sm text-final-muted">Name (for the guest list)
              <input required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={`${field} mt-1`} />
            </label>
            <label className="block text-sm text-final-muted">Email (we send your tickets here)
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" className={`${field} mt-1`} />
            </label>
            <label className="block text-sm text-final-muted">Phone number
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" inputMode="tel" placeholder="0803 123 4567" className={`${field} mt-1`} />
            </label>
            {hasCode ? (
              <label className="block text-sm text-final-muted">Waitlist code
                <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={30} placeholder="FH…" className={`${field} mt-1 font-mono uppercase`} />
              </label>
            ) : (
              <button type="button" onClick={() => setHasCode(true)} className="text-sm text-final-muted underline underline-offset-4 hover:text-final-off-white">Have a waitlist code?</button>
            )}
            {quote?.codeError && <p className="text-sm text-final-ember" role="alert">{quote.codeError}</p>}
          </div>

          <div className="flex flex-col">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-final-muted">Your order</h3>
            {quote ? (
              <dl className="mt-3 space-y-1.5 text-sm">
                {quote.lines.map((l) => (
                  <div key={l.id} className="flex justify-between gap-3"><dt className="text-final-muted">{l.quantity} × {l.name}</dt><dd className="tabular-nums">{formatCurrency(l.lineTotal)}</dd></div>
                ))}
                {quote.discount && (
                  <div className="flex justify-between gap-3 text-final-ember">
                    <dt>Waitlist {quote.discount.percent}% off {quote.discount.tickets === 1 ? '1 ticket' : `${quote.discount.tickets} tickets`}</dt>
                    <dd className="tabular-nums">−{formatCurrency(quote.discount.amount)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-final-off-white/10 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(quote.total)}</dd></div>
                {quote.issue && !quote.codeError && <p className="pt-1 text-sm text-final-ember" role="alert">{quote.issue}</p>}
              </dl>
            ) : <div className="skeleton mt-3 h-16 rounded" />}

            <label className="mt-5 flex items-start gap-2 text-sm text-final-off-white/80">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
              <span>{terms}</span>
            </label>
            {error && <p className="mt-3 text-sm text-final-ember" role="alert">{error}</p>}
            <button type="submit" disabled={!canPay} className="btn-primary mt-5 w-full disabled:opacity-40">
              {busy ? 'Opening Flutterwave…' : quote?.ok ? `Pay ${formatCurrency(quote.total)}` : 'Choose tickets'}
            </button>
            <p className="mt-3 text-center text-xs text-final-muted">Paid securely with Flutterwave. Your tickets arrive by email as soon as payment is confirmed.</p>
          </div>
        </div>
      )}
    </form>
  )
}
