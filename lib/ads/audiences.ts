// The two customer lists Studio offers for Meta's custom audiences. Plain data,
// so the Studio page can show them; the hashing and the file are in ./audience.

/** Purchasers older than this are no longer excluded from Prospecting (docs/erp/07-reachout.md, W3). */
export const PURCHASER_DAYS = 180

export const AUDIENCES = {
  purchasers: {
    label: 'Purchasers, last 180 days',
    file: 'purchasers-180d',
    use: 'Exclude from Prospecting and Retention.',
  },
  subscribers: {
    label: 'Warm subscribers who haven’t bought',
    file: 'warm-subscribers',
    use: 'Include in Retention.',
  },
} as const
export type AudienceKind = keyof typeof AUDIENCES

export const isAudienceKind = (v: unknown): v is AudienceKind => typeof v === 'string' && Object.hasOwn(AUDIENCES, v)
