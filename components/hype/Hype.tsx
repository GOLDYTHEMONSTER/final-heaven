'use client'

import { useState } from 'react'
import { rankLabel, type Rank } from '@/lib/hype'
import { useHype } from '@/lib/useHype'
import { useInterestStore } from '@/lib/stores/interestStore'

// Hype in the store: the rank badge, the small tag on product cards and the
// meter with its button on the product page. Styles: app/hype.css (shared
// with the design draft, brand/hype/draft.html). Nothing renders while Hype
// is off.

export function RankBadge({ rank, early = false, rankup = false, className = '' }: { rank: Rank; early?: boolean; rankup?: boolean; className?: string }) {
  return (
    <span className={`fh-rank ${rankup ? 'is-rankup' : ''} ${className}`} data-rank={rank} title={early ? 'Few hypes so far: the rank may change quickly' : undefined}>
      <span className="fh-rank__glyph" aria-hidden="true">{rank === 'buzzing' && <><i /><i /><i /></>}</span>
      {rankLabel(rank)}
      {early && <span className="fh-rank__early">Early</span>}
      {rankup && <span className="fh-rank__ring" aria-hidden="true" />}
    </span>
  )
}

/** On a product card: the score and rank, once a product has any hype. */
export function HypeTag({ productId }: { productId: string }) {
  const { enabled, data } = useHype(productId)
  if (!enabled || !data || data.hypes < 1) return null
  return (
    <p className="mt-1.5 flex items-center gap-2" aria-label={`Hype ${Math.round(data.score)}, ${rankLabel(data.rank)}`}>
      <span className="fh-score text-[13px]">{Math.round(data.score)}</span>
      <RankBadge rank={data.rank} early={data.early} className="!text-[9px]" />
    </p>
  )
}

const FLAME = 'M12 22c4.4 0 7-2.9 7-6.6 0-3.4-2.1-5.6-3.6-7.6-.4 1.6-1.3 2.8-2.4 3.3.2-3-1.1-6.2-4-8.1.2 3.2-1.6 5.4-3.1 7.5C4.7 12.2 5 13.3 5 15.4 5 19.1 7.6 22 12 22z'

/** On the product page: the score, rank, a meter and the Hype button. */
export function HypeMeter({ productId, category }: { productId: string; category: string }) {
  const { enabled, data, mine, pending, rankedUp, hype } = useHype(productId)
  const [burst, setBurst] = useState(0)
  const [note, setNote] = useState('')
  const addFavoriteCategory = useInterestStore((s) => s.addFavoriteCategory)
  if (!enabled) return null

  const score = data ? Math.round(data.score) : 0
  const rank: Rank = data?.rank ?? 'unseen'
  async function tap() {
    if (mine || pending) return
    setBurst((b) => b + 1)
    const result = await hype()
    if (result === 'accepted') { setNote(''); addFavoriteCategory(category) }
    else if (result === 'duplicate') setNote('You’ve already hyped this.')
    else setNote('That didn’t go through. Try again in a moment.')
  }

  return (
    <section aria-label="Hype" className="rounded-xl border border-final-off-white/10 p-4">
      <div className="flex items-center gap-3">
        <span key={`s${score}`} className={`fh-score text-3xl ${rankedUp ? 'is-tick' : ''}`}>{score}</span>
        <RankBadge key={rank} rank={rank} early={data?.early} rankup={rankedUp} />
      </div>
      <div className="fh-meter mt-3" style={{ '--fh-score': score } as React.CSSProperties}><i /></div>
      <p className="mt-2 text-xs text-final-muted">
        Community hype, not a rating{data?.hypes ? ` · ${data.hypes} ${data.hypes === 1 ? 'hype' : 'hypes'}` : ' · be the first'}
      </p>
      <button
        key={burst}
        type="button"
        onClick={tap}
        disabled={pending}
        aria-pressed={mine}
        className={`fh-hype mt-3 ${burst ? 'is-burst' : ''}`}
        data-state={pending ? 'pending' : mine ? 'on' : 'idle'}
      >
        <span className="fh-hype__sparks" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</span>
        <svg className="fh-hype__flame" viewBox="0 0 24 24" aria-hidden="true"><path d={FLAME} /></svg>
        {mine ? 'Hyped' : 'Hype'}
      </button>
      <p className="mt-2 min-h-[1rem] text-xs text-final-muted" role="status">{note}</p>
    </section>
  )
}
