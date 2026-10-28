'use client'

import { RefObject, useEffect, useState } from 'react'

const HOLD_MS = 280 // press this long to peek
const SLOP_PX = 10 // a drag past this before the hold is a scroll
const IDLE_MS = 700 // the page must be still this long before a card peeks on its own
const FIRST_MS = 1500 // first peek after the page settles
const PEEK_MS = 1800 // how long an automatic peek holds before easing back
const SETTLE_MS = 900 // the slower fade an automatic peek uses (data-peek)

/*
 * Automatic peeks, shared by every card on the page: nothing moves while the
 * page scrolls; once it has been still for a moment, the one card nearest the
 * middle of the screen peeks, holds, and eases back. Each card peeks once per
 * visit, any touch or scroll cancels it, and reduced motion turns it off
 * (holding a card still works).
 */
const cards = new Set<HTMLElement>()
const peeked = new WeakSet<HTMLElement>()
let active: HTMLElement | null = null
let idleTimer: number | undefined
let endTimer: number | undefined
let touching = false
let listening = false

function endPeek() {
  window.clearTimeout(endTimer)
  const el = active
  active = null
  if (!el) return
  delete el.dataset.revealed
  window.setTimeout(() => delete el.dataset.peek, SETTLE_MS)
}

function peekCentre() {
  if (document.hidden || touching || active) return
  const mid = window.innerHeight / 2
  let best: HTMLElement | null = null
  let bestDistance = window.innerHeight * 0.22 // only cards whose centre is near the middle
  for (const el of cards) {
    if (peeked.has(el) || 'revealed' in el.dataset) continue
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > window.innerHeight) continue
    const d = Math.abs(r.top + r.height / 2 - mid)
    if (d < bestDistance) { best = el; bestDistance = d }
  }
  if (!best) return
  peeked.add(best)
  active = best
  best.dataset.peek = ''
  best.dataset.revealed = ''
  endTimer = window.setTimeout(endPeek, PEEK_MS)
}

const schedule = (ms: number) => { window.clearTimeout(idleTimer); idleTimer = window.setTimeout(peekCentre, ms) }
const onScroll = () => { endPeek(); schedule(IDLE_MS) }
const onTouchStart = () => { touching = true; window.clearTimeout(idleTimer); endPeek() }
const onTouchEnd = () => { touching = false; schedule(IDLE_MS) }

function startAutoPeek() {
  if (listening || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  listening = true
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { passive: true })
  schedule(FIRST_MS)
}

/**
 * Hover reveals for touch screens, which have no hover. A card shows what a
 * pointer reveals on hover (its second photo, its rank frame) while it has
 * `data-revealed`: when it's pressed and held, and once on its own when it's
 * the card in the middle of a still screen (see above). A quick tap still
 * opens the link, a drag still scrolls, and the tap that ends a hold doesn't
 * navigate. `near` turns true a little before the card reaches the screen, so
 * the hidden extras are loaded before they're shown.
 * Pointer devices keep plain hover: nothing is attached there.
 */
export function useTouchReveal(ref: RefObject<HTMLElement>, enabled = true) {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return
    if (!window.matchMedia('(hover: none)').matches) return

    // Loads the extras about half a screen ahead.
    const nearBy = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setNear(true); nearBy.disconnect() }
    }, { rootMargin: '50% 0px 50% 0px' })
    nearBy.observe(el)
    cards.add(el)
    startAutoPeek()

    let timer: number | undefined
    let start: { x: number; y: number } | null = null
    let held = false
    const cancel = () => { window.clearTimeout(timer); start = null }
    const release = () => { cancel(); if (active !== el) delete el.dataset.revealed }
    const onStart = (e: TouchEvent) => {
      held = false
      if (e.touches.length !== 1) return release()
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setNear(true)
      timer = window.setTimeout(() => {
        held = true
        delete el.dataset.peek // a held card answers at the quick, hover speed
        el.dataset.revealed = ''
        navigator.vibrate?.(8) // a tick on Android; iOS has no web haptics
      }, HOLD_MS)
    }
    const onMove = (e: TouchEvent) => {
      if (!start || held) return
      const t = e.touches[0]
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > SLOP_PX) cancel()
    }
    // A hold is a peek, not a tap: the click that follows it doesn't open the product or add to cart.
    const onClick = (e: MouseEvent) => { if (held) { e.preventDefault(); e.stopPropagation(); held = false } }
    // Keeps the phone's own long-press menu (save image, link preview) out of the way.
    const onMenu = (e: Event) => { if (start || held) e.preventDefault() }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', release)
    el.addEventListener('touchcancel', release)
    el.addEventListener('click', onClick, true)
    el.addEventListener('contextmenu', onMenu)
    return () => {
      nearBy.disconnect()
      cards.delete(el)
      if (active === el) endPeek()
      release()
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', release)
      el.removeEventListener('touchcancel', release)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('contextmenu', onMenu)
    }
  }, [ref, enabled])
  return { near }
}
