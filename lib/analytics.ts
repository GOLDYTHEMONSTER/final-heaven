'use client'

import { track as vercelTrack } from '@vercel/analytics'

export type TrackEvent = 'product_view' | 'add_to_cart' | 'checkout_started'

/**
 * Records a shopping step as a Vercel Web Analytics custom event (page views
 * are recorded automatically by <VercelAnalytics />). Fire-and-forget: never
 * throws, sets no cookies. Skipped for Do Not Track / Global Privacy Control.
 * Note: Vercel stores custom events on Pro and Enterprise plans only.
 */
export function track(type: TrackEvent, data: { productId?: string } = {}) {
  if (typeof window === 'undefined') return
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return
    vercelTrack(type, data.productId ? { productId: data.productId } : undefined)
  } catch {
    // analytics must never break the page
  }
}
