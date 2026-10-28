'use client'

import { RefObject, useEffect, useState } from 'react'

const HOLD_MS = 280
const SLOP_PX = 10

/**
 * Hover reveals for touch screens, which have no hover: press and hold a card
 * to peek (its second photo, its rank frame), let go to put it back. While
 * held the element has `data-revealed`, so CSS shows what a pointer reveals on
 * hover. A quick tap still opens the link; a drag scrolls as usual and never
 * reveals; the tap that ends a hold doesn't navigate.
 * `near` turns true a little before the element reaches the screen, so the
 * hidden extras are loaded before anyone holds the card.
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

    let timer: number | undefined
    let start: { x: number; y: number } | null = null
    let held = false
    const cancel = () => { window.clearTimeout(timer); start = null }
    const release = () => { cancel(); delete el.dataset.revealed }
    const onStart = (e: TouchEvent) => {
      held = false
      if (e.touches.length !== 1) return release()
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setNear(true)
      timer = window.setTimeout(() => {
        held = true
        el.dataset.revealed = ''
        navigator.vibrate?.(8) // a tick on Android; iOS has no web haptics
      }, HOLD_MS)
    }
    const onMove = (e: TouchEvent) => {
      // A drag before the hold completes is a scroll, not a peek.
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
