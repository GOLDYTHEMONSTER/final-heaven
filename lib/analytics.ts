'use client'

export type TrackEvent = 'page_view' | 'product_view' | 'add_to_cart' | 'checkout_started'

/**
 * Sends one anonymous analytics event. Fire-and-forget: never throws, never
 * blocks navigation, sets no cookies and stores nothing in the browser.
 * The server ignores visitors who send Do Not Track or Global Privacy Control.
 */
export function track(type: TrackEvent, data: { productId?: string } = {}) {
  if (typeof window === 'undefined') return
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return
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
  } catch {
    // analytics must never break the page
  }
}
