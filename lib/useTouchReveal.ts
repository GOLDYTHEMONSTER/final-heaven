'use client'

import { RefObject, useEffect, useState } from 'react'

/**
 * Hover reveals for touch screens, which have no hover: while the element
 * crosses the middle of the screen it gets `data-revealed`, so CSS can show
 * what a pointer would reveal on hover (a product's second photo, its rank
 * frame). `near` turns true a little before it reaches the screen, so the
 * hidden extras can start loading in time instead of popping in late.
 * Pointer devices keep plain hover: nothing is observed there.
 */
export function useTouchReveal(ref: RefObject<HTMLElement>, enabled = true) {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return
    if (!window.matchMedia('(hover: none)').matches) return

    // Starts loading the extras about half a screen ahead.
    const nearBy = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setNear(true); nearBy.disconnect() }
    }, { rootMargin: '50% 0px 50% 0px' })
    // "Hovered" while in the middle band of the screen.
    const centre = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.dataset.revealed = ''
      else delete el.dataset.revealed
    }, { rootMargin: '-38% 0px -38% 0px' })
    nearBy.observe(el)
    centre.observe(el)
    return () => { nearBy.disconnect(); centre.disconnect(); delete el.dataset.revealed }
  }, [ref, enabled])
  return { near }
}
