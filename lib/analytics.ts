'use client'

import { track as vercelTrack } from '@vercel/analytics'

/**
 * Funnel steps, in order. Admin -> Analytics places each visitor at the
 * furthest step they reached in a day, so the funnel can only narrow.
 */
export type TrackEvent =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_started'
  | 'order_placed'
  | 'payment_completed'

// The same event fired twice within this window counts once (React's
// development double-render, double clicks, quick re-renders).
const DEDUPE_MS = 1500
let last: { key: string; at: number } | null = null

/**
 * Records one anonymous analytics event in two places:
 *  1. Our own database via /api/track. This is what Admin -> Analytics shows,
 *     so the store owner sees everything in admin without a third-party login.
 *  2. Vercel Web Analytics, for the developer. Page views reach Vercel through
 *     <VercelAnalytics />, so only the shopping steps are sent from here
 *     (Vercel stores custom events on Pro plans).
 * Fire-and-forget: never throws, never blocks navigation, sets no cookies.
 * Skipped entirely for Do Not Track / Global Privacy Control.
 */
export function track(type: TrackEvent, data: { productId?: string } = {}) {
  if (typeof window === 'undefined') return
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return

    const key = `${type}|${window.location.pathname}|${data.productId ?? ''}`
    const now = Date.now()
    if (last && last.key === key && now - last.at < DEDUPE_MS) return
    last = { key, at: now }

    const payload = JSON.stringify({
      type,
      url: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      productId: data.productId,
    })
    const blob = new Blob([payload], { type: 'text/plain' })
    if (!navigator.sendBeacon?.('/api/track', blob)) {
      fetch('/api/track', { method: 'POST', body: payload, keepalive: true }).catch(() => {})
    }

    if (type !== 'page_view') vercelTrack(type, data.productId ? { productId: data.productId } : undefined)
  } catch {
    // analytics must never break the page
  }
}
