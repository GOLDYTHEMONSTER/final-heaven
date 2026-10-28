'use client'

import { useState } from 'react'
import { TIER_NUMERALS, rankLabel, type Rank } from '@/lib/hype'
import { cardFrame, type CardFrame as CardFrameGeometry } from '@/lib/hype-frames'
import { useHype } from '@/lib/useHype'
import { useInterestStore } from '@/lib/stores/interestStore'

// Hype in the store: illustrated rank crests with tiers, the crest badge on
// product cards (the rank frame of Elite, Iconic and Legendary products shows
// on hover, inside the card) and the meter with its button on the product page. Art: public/hype (scripts/hype-art.mjs);
// motion: app/hype.css. Nothing renders while Hype is off.

/** Ranks whose product cards show a frame on hover. */
export const FRAMED: Rank[] = ['elite', 'iconic', 'legendary']

// Where the sparkles sit on Elite and Iconic crests (fractions of the crest).
const SPARKLES = [[0.18, 0.22], [0.78, 0.18], [0.62, 0.62], [0.3, 0.7], [0.86, 0.48], [0.1, 0.5]]

type Css = React.CSSProperties & Record<`--${string}`, string | number>

/** A rank's crest with its tier medallion. `climb` plays the rank-up or tier-up once. */
export function RankCrest({ rank, tier = null, size = 48, climb = null, className = '' }:
  { rank: Rank; tier?: number | null; size?: number; climb?: 'rank' | 'tier' | null; className?: string }) {
  const src = `/hype/crest-${rank}-${size > 96 ? 384 : 160}.webp`
  return (
    <span
      className={`fh-crest ${climb === 'rank' ? 'is-rankup' : ''} ${climb === 'tier' ? 'is-tierup' : ''} ${className}`}
      data-rank={rank}
      style={{ '--crest': `${size}px`, '--fh-crest-src': `url(${src})` } as Css}
      role="img"
      aria-label={`${rankLabel(rank)}${tier ? ` ${TIER_NUMERALS[tier]}` : ''}`}
    >
      <span className="fh-crest__glow" />
      <span className="fh-crest__rays" />
      <span className="fh-crest__shock" />
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static badge, already sized and compressed */}
      <img className="fh-crest__art" src={src} alt="" width={size} height={size} decoding="async" />
      <span className="fh-crest__sheen" />
      <span className="fh-crest__fx">
        {SPARKLES.map(([x, y], i) => <i key={i} style={{ '--i': i, '--x': `${x * 100}%`, '--y': `${y * 100}%` } as Css} />)}
      </span>
      <span className="fh-crest__flash" />
      <span className="fh-crest__burst">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as Css} />)}</span>
      {tier ? <span className="fh-crest__tier">{TIER_NUMERALS[tier]}</span> : null}
    </span>
  )
}

/** The rank's name and tier, as words beside a crest. */
export function RankName({ rank, tier, early }: { rank: Rank; tier: number | null; early?: boolean }) {
  return (
    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]">
      {rankLabel(rank)}{tier ? ` ${TIER_NUMERALS[tier]}` : ''}
      {early && <span className="ml-1.5 border-l border-current pl-1.5 opacity-60" title="Few hypes so far: the rank may change quickly">Early</span>}
    </span>
  )
}

/** The frame a product card shows on hover, or null. */
export function useCardFrame(productId: string) {
  const { enabled, data } = useHype(productId)
  const rank = enabled && data && FRAMED.includes(data.rank) ? data.rank : null
  const geometry = rank ? cardFrame(rank) : null
  return rank && geometry ? {
    rank, geometry,
    /** For the card's photo link: where it eases to on hover. */
    photoStyle: { '--fh-photo-x': geometry.photo.x, '--fh-photo-y': geometry.photo.y, '--fh-photo-scale': geometry.photo.scale } as Css,
    /** For the add button: where it moves on hover. */
    buttonStyle: { '--fh-btn-right': geometry.button.right, '--fh-btn-bottom': geometry.button.bottom } as Css,
  } : null
}

/** Behind the photo: a soft blurred copy of it filling the frame's opening, so no gap shows around the photo on hover. */
export function CardFrameMat({ geometry, photo }: { geometry: CardFrameGeometry; photo: string }) {
  return <span className="fh-cardframe__mat" aria-hidden="true" style={{ ...geometry.opening, backgroundImage: `url(${photo})` }} />
}

/** The rank frame over a card's image box: hidden until hover or focus (app/hype.css). */
export function CardFrame({ rank, geometry }: { rank: Rank; geometry: CardFrameGeometry }) {
  const src = `/hype/frame-${rank}-800.webp`
  return (
    <span className="fh-cardframe" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative overlay, already sized and compressed */}
      <img className="fh-cardframe__art" src={src} alt="" style={geometry.art} loading="lazy" decoding="async" />
      <span className="fh-cardframe__sheen" style={{ ...geometry.art, '--fh-frame-src': `url(${src})` } as Css} />
      {rank === 'legendary' && (
        <span className="fh-cardframe__embers">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--i': i } as Css} />)}</span>
      )}
    </span>
  )
}

/** On a product card: the crest, rank and score, once a product has any hype. */
export function HypeTag({ productId }: { productId: string }) {
  const { enabled, data, tier } = useHype(productId)
  if (!enabled || !data || data.hypes < 1) return null
  return (
    <p className="mt-2 flex items-center gap-2" aria-label={`Hype ${Math.round(data.score)}, ${rankLabel(data.rank)}${tier ? ` ${TIER_NUMERALS[tier]}` : ''}`}>
      <RankCrest rank={data.rank} size={30} />
      <span className="fh-score text-[15px]">{Math.round(data.score)}</span>
      <span className="text-final-muted"><RankName rank={data.rank} tier={tier} early={data.early} /></span>
    </p>
  )
}

const FLAME = 'M12 22c4.4 0 7-2.9 7-6.6 0-3.4-2.1-5.6-3.6-7.6-.4 1.6-1.3 2.8-2.4 3.3.2-3-1.1-6.2-4-8.1.2 3.2-1.6 5.4-3.1 7.5C4.7 12.2 5 13.3 5 15.4 5 19.1 7.6 22 12 22z'

/** On the product page: the crest, rank, tier, score, a meter and the Hype button. */
export function HypeMeter({ productId, category }: { productId: string; category: string }) {
  const { enabled, data, tier, mine, pending, climb, hype } = useHype(productId)
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
      <div className="flex items-center gap-4">
        <RankCrest key={`${rank}-${tier}-${climb}`} rank={rank} tier={tier} size={92} climb={climb} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span key={`s${score}`} className={`fh-score text-4xl ${climb ? 'is-tick' : ''}`}>{score}</span>
            <span className="text-xs text-final-muted">hype</span>
          </div>
          <RankName rank={rank} tier={tier} early={data?.early} />
        </div>
      </div>
      <div className="fh-meter mt-4" style={{ '--fh-score': score } as Css}><i /></div>
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
        <span className="fh-hype__sparks" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--i': i } as Css} />)}</span>
        <svg className="fh-hype__flame" viewBox="0 0 24 24" aria-hidden="true"><path d={FLAME} /></svg>
        {mine ? 'Hyped' : 'Hype'}
      </button>
      <p className="mt-2 min-h-[1rem] text-xs text-final-muted" role="status">{note}</p>
    </section>
  )
}
