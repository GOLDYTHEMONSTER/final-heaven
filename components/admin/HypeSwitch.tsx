'use client'

import { useEffect, useState } from 'react'
import { RankBadge } from '@/components/hype/Hype'
import type { Rank } from '@/lib/hype'

// Hype on or off for the store (Store settings), with the most-hyped products.
// Off by default: scores start at zero, so it's worth switching on once the
// store has visitors, or labelling it "early" honestly (the ranks do that).

type Top = { product_id: string; score: number; rank: Rank; early: boolean; hypes: number; hypes_7d: number; products: { name: string } | null }

export function HypeSwitch() {
  const [state, setState] = useState<{ available: boolean; enabled?: boolean; top?: Top[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/hype', { cache: 'no-store' }).then((r) => r.json()).then(setState).catch(() => setState({ available: false }))
  }, [])

  async function toggle() {
    if (!state?.available) return
    const next = !state.enabled
    if (next && !confirm('Switch Hype on? Shoppers will see a Hype button and scores on products straight away.')) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/hype', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Couldn’t change it.')
      setState((s) => ({ ...s!, enabled: body.enabled }))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <section className="rounded-xl border border-final-off-white/10 bg-final-gray p-5">
      <h2 className="font-semibold">Hype</h2>
      <p className="mt-1 text-sm text-final-muted">
        Shoppers tap Hype on products they like, without an account; each product gets a community score and a rank (Unseen to Legendary).
        One hype per browser per product. It shows attention, not quality, and says so.
      </p>
      {state && !state.available && <p className="mt-3 text-sm text-yellow-200">Not set up in the database yet (migration 20261028100000_product_hype).</p>}
      {state?.available && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" role="switch" aria-checked={state.enabled} onClick={toggle} disabled={busy}
              className={`relative h-6 w-11 rounded-full transition-colors ${state.enabled ? 'bg-final-ember' : 'bg-final-off-white/20'} disabled:opacity-50`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-final-off-white transition-[left] ${state.enabled ? 'left-[22px]' : 'left-0.5'}`} />
              <span className="sr-only">Hype</span>
            </button>
            <span className="text-sm">{state.enabled ? 'On: shoppers can hype products' : 'Off: nothing shows in the store'}</span>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-final-ember">{error}</p>}
          {!!state.top?.length && (
            <ul className="mt-4 divide-y divide-final-off-white/5 text-sm">
              {state.top.map((t) => (
                <li key={t.product_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{t.products?.name ?? t.product_id}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-final-muted tabular-nums">
                    {t.hypes} hypes · {t.hypes_7d} this week · <strong className="text-final-off-white">{Math.round(Number(t.score))}</strong>
                    <RankBadge rank={t.rank} early={t.early} className="!text-[9px]" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
