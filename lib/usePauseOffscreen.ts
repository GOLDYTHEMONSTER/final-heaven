'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Marks an element `data-offscreen` while it's out of view, so CSS can pause
 * its endless animations (see `[data-offscreen]` in globals.css). A looping
 * animation nobody can see still costs the phone a repaint every frame, and
 * that work competes with scrolling.
 */
export function usePauseOffscreen(ref: RefObject<HTMLElement>, margin = '100px') {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.removeAttribute('data-offscreen')
      else el.setAttribute('data-offscreen', '')
    }, { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, margin])
}
