// Where an order came from, first-party: the ad tags on the link someone landed
// from (utm_* and Meta's fbclid), kept as the first and the last touch.
//
// Pure and shared. The browser reads the tags from the landing address and keeps
// them (./attribution-client), the visit tracker (/api/track) records them on
// the visit, checkout carries them to the Checkout and the Checkout to the
// order. Everything the browser sends is checked again on the server here, and
// nothing in it ever affects a price: it only labels where a sale came from.

export const TAG_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'] as const
export type TagKey = (typeof TAG_KEYS)[number]

/** One landing's tags. A key is absent when the link didn't carry it. */
export type Touch = Partial<Record<TagKey, string>>
/** The first landing someone had with tags, and the latest one. */
export type Attribution = { first?: Touch; last?: Touch }

/** The longest value kept for any tag (the database enforces the same). */
export const MAX_TAG = 200

// Control characters and the characters that can break out of an attribute or a
// string. Tag values come from links anyone can write, so they are data only.
const UNSAFE = /[\u0000-\u001f\u007f<>"'`\\]/g
// Meta's click ID is URL-safe base64 style.
const CLICK_ID = /^[A-Za-z0-9_-]+$/

/** A tag value made safe to store: trimmed, stripped of unsafe characters, cut to MAX_TAG; null when nothing is left. */
export function cleanTag(key: TagKey, value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.slice(0, 1_000).replace(UNSAFE, '').trim().slice(0, MAX_TAG)
  if (!s) return null
  return key === 'fbclid' && !CLICK_ID.test(s) ? null : s
}

/** The tags in a record (a landing address's parameters, or a browser's stored copy); anything else is ignored. */
export function cleanTouch(value: unknown): Touch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const touch: Touch = {}
  for (const key of TAG_KEYS) {
    const v = cleanTag(key, (value as Record<string, unknown>)[key])
    if (v) touch[key] = v
  }
  return Object.keys(touch).length ? touch : null
}

/** The tags on a landing address, or null when it carries none. */
export function touchFromParams(params: URLSearchParams): Touch | null {
  return cleanTouch(Object.fromEntries(TAG_KEYS.map((k) => [k, params.get(k)])))
}

/** Attribution from a request body: the first and last touch, cleaned; null when there is nothing to keep. Never throws. */
export function parseAttribution(value: unknown): Attribution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const first = cleanTouch(raw.first)
  const last = cleanTouch(raw.last)
  if (!first && !last) return null
  return { ...(first ? { first } : {}), ...(last ? { last } : {}) }
}

/** How long a browser keeps a first touch before a new landing counts as a first one again. */
export const FIRST_TOUCH_DAYS = 30

/**
 * The stored attribution after a landing. The first touch stays until it is
 * FIRST_TOUCH_DAYS old; the last touch is replaced by every landing that
 * carries tags (a plain visit from elsewhere doesn't erase an ad click).
 */
export function mergeLanding(stored: { attribution: Attribution; firstAt: number } | null, landing: Touch | null, now: number) {
  const fresh = stored && now - stored.firstAt < FIRST_TOUCH_DAYS * 86_400_000 ? stored : null
  if (!landing) return fresh
  return {
    attribution: { first: fresh?.attribution.first ?? landing, last: landing },
    firstAt: fresh?.firstAt ?? now,
  }
}
