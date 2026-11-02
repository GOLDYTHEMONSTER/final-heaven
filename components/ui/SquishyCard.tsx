'use client'

import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

/* ── squishy card ────────────────────────────────────────────────
 * Squishy Pricing (21st.dev), made ours: a coloured card whose shapes
 * squash and slide while it's hovered. Here it is also "squished" while
 * it's `active` (a ticket tier with tickets chosen), because phones have
 * no hover. Every animated piece has an explicit rest state, so it
 * settles back the same way whether hover or `active` ends.
 * ─────────────────────────────────────────────────────────────── */

export type SquishyTone = 'concrete' | 'ember' | 'bone'
export type SquishyShape = 'orbs' | 'blocks' | 'chevrons'

const TONE: Record<SquishyTone, { card: string; ink: string; chip: string; shape: string }> = {
  concrete: { card: 'bg-[#26262a]', ink: 'text-final-off-white', chip: 'border-white/20 bg-white/10', shape: 'rgba(255,255,255,0.07)' },
  ember: { card: 'bg-final-ember', ink: 'text-white', chip: 'border-white/25 bg-black/15', shape: 'rgba(0,0,0,0.18)' },
  bone: { card: 'bg-[#e8e5de]', ink: 'text-final-black', chip: 'border-black/15 bg-black/5', shape: 'rgba(0,0,0,0.09)' },
}

const EASE = { duration: 1, ease: 'backInOut' } as const
const later = (delay: number) => ({ ...EASE, delay })

const card: Variants = { rest: { scale: 1 }, hover: { scale: 1.03 } }
const price: Variants = { rest: { scale: 0.85 }, hover: { scale: 1 } }

function Orbs({ fill }: { fill: string }) {
  return (
    <motion.svg viewBox="0 0 320 384" fill="none" aria-hidden className="absolute inset-0 z-0 h-full w-full" preserveAspectRatio="xMidYMid slice"
      variants={{ rest: { scale: 1 }, hover: { scale: 1.5 } }} transition={EASE}>
      <motion.circle cx="160.5" cy="114.5" r="101.5" fill={fill} variants={{ rest: { scaleY: 1, y: 0 }, hover: { scaleY: 0.5, y: -25 } }} transition={later(0.2)} />
      <motion.ellipse cx="160.5" cy="265.5" rx="101.5" ry="43.5" fill={fill} variants={{ rest: { scaleY: 1, y: 0 }, hover: { scaleY: 2.25, y: -25 } }} transition={later(0.2)} />
    </motion.svg>
  )
}

function Blocks({ fill }: { fill: string }) {
  return (
    <motion.svg viewBox="0 0 320 384" fill="none" aria-hidden className="absolute inset-0 z-0 h-full w-full" preserveAspectRatio="xMidYMid slice"
      variants={{ rest: { scale: 1 }, hover: { scale: 1.05 } }} transition={EASE}>
      <motion.rect x="14" width="153" height="153" rx="4" fill={fill}
        variants={{ rest: { y: 12, rotate: 0, scaleX: 1 }, hover: { y: 219, rotate: 90, scaleX: 2 } }} transition={later(0.2)} />
      <motion.rect x="155" width="153" height="153" rx="4" fill={fill}
        variants={{ rest: { y: 219, rotate: 0, scaleX: 1 }, hover: { y: 12, rotate: 90, scaleX: 2 } }} transition={later(0.2)} />
    </motion.svg>
  )
}

// Three stacked chevrons, lowest first (each lifts a little later than the one above).
const CHEVRONS = [
  { delay: 0.3, d: 'M148.893 157.531C154.751 151.673 164.249 151.673 170.107 157.531L267.393 254.818C273.251 260.676 273.251 270.173 267.393 276.031L218.75 324.674C186.027 357.397 132.973 357.397 100.25 324.674L51.6068 276.031C45.7489 270.173 45.7489 260.676 51.6068 254.818L148.893 157.531Z' },
  { delay: 0.2, d: 'M148.893 99.069C154.751 93.2111 164.249 93.2111 170.107 99.069L267.393 196.356C273.251 202.213 273.251 211.711 267.393 217.569L218.75 266.212C186.027 298.935 132.973 298.935 100.25 266.212L51.6068 217.569C45.7489 211.711 45.7489 202.213 51.6068 196.356L148.893 99.069Z' },
  { delay: 0.1, d: 'M148.893 40.6066C154.751 34.7487 164.249 34.7487 170.107 40.6066L267.393 137.893C273.251 143.751 273.251 153.249 267.393 159.106L218.75 207.75C186.027 240.473 132.973 240.473 100.25 207.75L51.6068 159.106C45.7489 153.249 45.7489 143.751 51.6068 137.893L148.893 40.6066Z' },
]
function Chevrons({ fill }: { fill: string }) {
  return (
    <motion.svg viewBox="0 0 320 384" fill="none" aria-hidden className="absolute inset-0 z-0 h-full w-full" preserveAspectRatio="xMidYMid slice"
      variants={{ rest: { scale: 1 }, hover: { scale: 1.25 } }} transition={EASE}>
      {CHEVRONS.map(({ d, delay }) => (
        <motion.path key={delay} d={d} fill={fill} variants={{ rest: { y: 0 }, hover: { y: -50 } }} transition={later(delay)} />
      ))}
    </motion.svg>
  )
}

const SHAPES = { orbs: Orbs, blocks: Blocks, chevrons: Chevrons }

/**
 * `price` and `children` (the footer: a button or a stepper) are yours to
 * fill. `dimmed` greys a card that can't be chosen (sold out) and stops it
 * moving.
 */
export function SquishyCard({ label, price: amount, note, description, tone = 'concrete', shape = 'orbs', active = false, dimmed = false, children }: {
  label: ReactNode; price: ReactNode; note?: ReactNode; description?: ReactNode
  tone?: SquishyTone; shape?: SquishyShape; active?: boolean; dimmed?: boolean; children?: ReactNode
}) {
  const t = TONE[tone]
  const Shape = SHAPES[shape]
  return (
    <motion.div initial={false} animate={active && !dimmed ? 'hover' : 'rest'} whileHover={dimmed ? undefined : 'hover'} variants={card} transition={EASE}
      className={`relative flex min-h-[24rem] w-full max-w-[20rem] shrink-0 flex-col overflow-hidden rounded-[6px] p-7 shadow-lg shadow-black/40 ${t.card} ${t.ink} ${dimmed ? 'opacity-50 grayscale' : ''}`}>
      <div className="relative z-10 pb-20">
        <span className={`mb-3 block w-fit border px-2.5 py-0.5 font-mono text-xs uppercase tracking-[0.18em] ${t.chip}`}>{label}</span>
        <motion.span variants={price} transition={EASE} className="my-2 block origin-top-left font-mono text-5xl font-black leading-[1.15]">{amount}</motion.span>
        {note && <p className="font-mono text-xs uppercase tracking-[0.18em] opacity-80">{note}</p>}
        {description && <p className="mt-3 text-base opacity-90">{description}</p>}
      </div>
      <div className="absolute inset-x-4 bottom-4 z-20">{children}</div>
      <Shape fill={t.shape} />
    </motion.div>
  )
}
