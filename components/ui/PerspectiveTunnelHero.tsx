'use client'

import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/* ── the tunnel ──────────────────────────────────────────────────
 * Perspective Tunnel Hero (21st.dev), made ours. Photos fly out of a
 * vanishing point towards the viewer as the page scrolls, round a title
 * that grows as you go in, with the pointer nudging the camera.
 *
 * Changed from the original:
 *  - It follows the page scroll (a tall section with a sticky stage)
 *    instead of capturing the mouse wheel, so it works on phones and with
 *    the keyboard, and the page carries on past it when the tunnel ends.
 *  - It opens a little way in, so the first photos are already there.
 *  - Reduced motion: no scroll travel and no camera sway; one still frame.
 *  - Our colours, a photo backdrop, flyer labels, and no 100vw (which
 *    scrolls sideways when there's a scrollbar).
 * ─────────────────────────────────────────────────────────────── */

export type TunnelImage = { src: string; title: string }

type Stage = { width: number; height: number; isMobile: boolean }

type Card = { item: TunnelImage; cos: number; sin: number; rx: number; ry: number; rotateZ: number; index: number }

// Golden-angle spiral: neighbours land far apart round the tunnel mouth.
const layout = (images: TunnelImage[]): Card[] => images.map((item, i) => {
  const angle = i * 137.5 * (Math.PI / 180)
  return {
    item, index: i, cos: Math.cos(angle), sin: Math.sin(angle),
    rx: 0.28 + (i % 3) * 0.08, ry: 0.26 + (i % 2) * 0.09,
    rotateZ: (i % 2 === 0 ? 1 : -1) * (3 + (i % 5) * 2),
  }
})

const SPRING = { stiffness: 60, damping: 25, mass: 0.5 }
// Where the tunnel starts and, under reduced motion, where it stays.
const OPENING = 0.12
const STILL = 0.45

function useCameraSway(enabled: boolean) {
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, SPRING)
  const y = useSpring(rawY, SPRING)
  useEffect(() => {
    if (!enabled) return
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth - 0.5) * 2)
      rawY.set((e.clientY / window.innerHeight - 0.5) * 2)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled, rawX, rawY])
  return { x, y }
}

function TunnelCard({ card, progress, pointer, total, stage }: {
  card: Card; progress: MotionValue<number>; pointer: { x: MotionValue<number>; y: MotionValue<number> }; total: number; stage: Stage
}) {
  const span = 0.55
  const start = (card.index / total) * (1 - span)
  const local = useTransform(progress, [start, start + span], [0, 1])
  const z = useTransform(local, [0, 1], stage.isMobile ? [-1200, 350] : [-1700, 500])
  const opacity = useTransform(local, [0, 0.18, 0.82, 0.98], [0, 1, 1, 0])

  const width = stage.isMobile ? Math.max(130, Math.min(180, stage.width * 0.38)) : Math.max(180, Math.min(270, stage.width * 0.18))
  const baseX = card.cos * stage.width * card.rx
  const baseY = card.sin * stage.height * card.ry
  const pan = stage.isMobile ? 20 : 45
  const transform = useTransform([z, pointer.x, pointer.y], ([currZ, px, py]: number[]) =>
    `translate3d(calc(-50% + ${baseX - px * pan}px), calc(-50% + ${baseY - py * pan}px), ${currZ}px) rotateZ(${card.rotateZ}deg)`)

  return (
    <motion.div style={{ width, transform, opacity, zIndex: card.index + 1 }}
      className="pointer-events-auto absolute left-1/2 top-1/2 aspect-[4/5] select-none will-change-transform">
      <div className="group relative h-full w-full overflow-hidden rounded-[3px] bg-final-gray shadow-2xl shadow-black/90 ring-1 ring-final-off-white/15 transition-[box-shadow] duration-500 hover:ring-final-ember/70">
        {/* eslint-disable-next-line @next/next/no-img-element -- sized by the 3D stage; the image optimiser is off (next.config.js) */}
        <img src={card.item.src} alt={card.item.title} draggable={false} loading={card.index < 4 ? 'eager' : 'lazy'} decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 bg-final-black px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-final-off-white sm:text-xs">
          {card.item.title}
        </span>
      </div>
    </motion.div>
  )
}

/**
 * A scroll-through tunnel of photos round a title. `children` are the
 * actions (buttons, links), kept above the photos so they stay clickable.
 * `length` is how far the page scrolls through the tunnel, in screen heights.
 */
export function PerspectiveTunnelHero({ images, eyebrow, title, subtitle, backdrop, children, length = 2.6 }: {
  images: TunnelImage[]; eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; backdrop?: string; children?: ReactNode; length?: number
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const [stage, setStage] = useState<Stage>({ width: 1440, height: 900, isMobile: false })
  const [cards] = useState(() => layout(images))

  useEffect(() => {
    const update = () => setStage({ width: document.documentElement.clientWidth, height: window.innerHeight, isMobile: window.innerWidth < 768 })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  const travelled = useTransform(scrollYProgress, [0, 1], [OPENING, 1])
  const smooth = useSpring(travelled, { stiffness: 80, damping: 30, restDelta: 0.0001 })
  const still = useMotionValue(STILL)
  const progress = reduce ? still : smooth
  const pointer = useCameraSway(!reduce)

  const titleScale = useTransform(progress, [0, 0.5, 1], [0.7, 1, 1.35])
  const titleOpacity = useTransform(progress, [0, OPENING, 0.85, 1], [0.25, 1, 1, 0])
  const promptOpacity = useTransform(progress, [OPENING, OPENING + 0.06], [1, 0])

  return (
    <section ref={sectionRef} className="relative" style={{ height: reduce ? '100svh' : `${length * 100}svh` }}>
      <div className="sticky top-0 flex h-[100svh] w-full items-center justify-center overflow-hidden bg-final-black text-final-off-white"
        style={{ perspective: stage.isMobile ? '900px' : '1200px', transformStyle: 'preserve-3d' }}>
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element -- full-bleed backdrop; the image optimiser is off (next.config.js)
          <img src={backdrop} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40" />
        )}
        {/* Vignette into the black, and a low ember glow at the vanishing point. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.55)_55%,#000_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(232,97,60,0.14)_0%,transparent_45%)]" />
        <div className="pointer-events-none absolute h-[48vmin] w-[48vmin] rounded-full border border-final-off-white/10" />
        <div className="pointer-events-none absolute h-[76vmin] w-[76vmin] rounded-full border border-dashed border-final-off-white/10" />

        <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', pointerEvents: 'none' }}>
          {cards.map((card) => <TunnelCard key={card.index} card={card} progress={progress} pointer={pointer} total={cards.length} stage={stage} />)}
        </div>

        {/* In front of the photos (the original let them cover it): the event's name must stay readable. */}
        <motion.div style={{ scale: titleScale, opacity: titleOpacity }}
          className="pointer-events-none relative z-20 flex max-w-2xl flex-col items-center px-6 text-center [text-shadow:0_2px_24px_rgba(0,0,0,0.85)]">
          {eyebrow && <p className="mb-4 bg-final-black/70 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.3em] text-final-ember sm:text-xs">{eyebrow}</p>}
          <h1 className="display text-5xl uppercase leading-[0.9] tracking-tight sm:text-7xl md:text-8xl">{title}</h1>
          {subtitle && <p className="mt-5 max-w-[38ch] text-sm text-final-off-white/85 sm:text-base">{subtitle}</p>}
        </motion.div>

        <div className="absolute inset-x-0 bottom-8 z-30 flex flex-col items-center gap-4 px-4">
          {children}
          {!reduce && (
            <motion.div style={{ opacity: promptOpacity }} className="pointer-events-none flex flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-final-muted">
              <span>Scroll to go in</span>
              <span className="h-6 w-px bg-gradient-to-b from-final-ember to-transparent" />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  )
}
