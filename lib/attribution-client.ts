'use client'

import { mergeLanding, parseAttribution, touchFromParams, type Attribution } from '@/lib/attribution'

const KEY = 'fh_attribution'

type Stored = { attribution: Attribution; firstAt: number }

function read(): Stored | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const attribution = parseAttribution(raw?.attribution)
    return attribution && Number.isFinite(raw.firstAt) ? { attribution, firstAt: raw.firstAt } : null
  } catch {
    return null
  }
}

/**
 * Keeps the ad tags of a landing address in this browser (first and last touch),
 * so the order can say where it came from days later. Written only when a link
 * carries tags, so a shopper who didn't come from an ad stores nothing. Skipped
 * for Do Not Track / Global Privacy Control, like every other tracker here.
 * Never throws.
 */
export function captureAttribution() {
  if (typeof window === 'undefined') return
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return
    const landing = touchFromParams(new URLSearchParams(window.location.search))
    if (!landing) return
    const next = mergeLanding(read(), landing, Date.now())
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // attribution must never break the page
  }
}

/** What checkout sends with the order: the stored touches, or undefined. The server checks them again. */
export function storedAttribution(): Attribution | undefined {
  if (typeof window === 'undefined') return undefined
  const stored = mergeLanding(read(), null, Date.now())
  return stored?.attribution
}
