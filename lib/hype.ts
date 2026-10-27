// Hype: a product's community score (0-100) and its rank. Pure, so the rules
// are tested (tests/unit/hype.test.ts); the endpoint (app/api/hype) and the
// daily job store what this returns.
//
// Hype measures attention, not quality: it's shown as "community hype, not a
// rating". The brief weights four signals (sentiment 35, review credibility
// 25, engagement 20, momentum 20). The store has no reviews yet, so the score
// uses the two signals that exist, engagement and momentum, weighted equally
// (their 20:20 in the brief). Reviews join when they exist.
//
// A rank needs both the score and enough evidence (accepted hypes), so a high
// score from a handful of taps reads "Early" instead of claiming the rank.
// Ranks are sticky by a few points (HYSTERESIS) so they don't flicker, and
// Legendary must be earned by holding Iconic for a week.

export const RANKS = [
  { key: 'unseen', label: 'Unseen', min: 0, evidence: 0, meaning: 'Newly discovered' },
  { key: 'emerging', label: 'Emerging', min: 10, evidence: 1, meaning: 'Early interest' },
  { key: 'buzzing', label: 'Buzzing', min: 25, evidence: 5, meaning: 'Growing attention' },
  { key: 'trending', label: 'Trending', min: 40, evidence: 15, meaning: 'Strong momentum' },
  { key: 'elite', label: 'Elite', min: 60, evidence: 40, meaning: 'A community favourite' },
  { key: 'iconic', label: 'Iconic', min: 75, evidence: 80, meaning: 'A major favourite' },
  { key: 'legendary', label: 'Legendary', min: 90, evidence: 150, meaning: 'Exceptional, and sustained' },
] as const
export type Rank = (typeof RANKS)[number]['key']

/** Starting hypotheses, to tune once there's real traffic. */
export const HYPE_RULES = {
  weights: { engagement: 0.5, momentum: 0.5 },
  /** Hypes at which engagement reaches ~63 of 100 (saturating, so the first hypes count most). */
  engagementScale: 60,
  /** Hypes in the last 7 days at which momentum reaches ~63 of 100. */
  momentumScale: 12,
  /** Points a score must fall below its rank's floor before the rank drops. */
  hysteresis: 3,
  /** Days a product must hold Iconic before it can become Legendary. */
  legendaryAfterDays: 7,
} as const

export type Counts = { total: number; last7: number }

const saturate = (n: number, scale: number) => 100 * (1 - Math.exp(-Math.max(0, n) / scale))
const index = (rank: Rank) => RANKS.findIndex((r) => r.key === rank)

/** The 0-100 score from accepted hypes, to one decimal. */
export function hypeScore({ total, last7 }: Counts): number {
  const w = HYPE_RULES.weights
  const s = w.engagement * saturate(total, HYPE_RULES.engagementScale) + w.momentum * saturate(last7, HYPE_RULES.momentumScale)
  return Math.round(Math.min(100, s) * 10) / 10
}

/**
 * The rank for a score. `previous` and `since` (when it took the previous
 * rank) make it sticky and make Legendary wait. `early` means the score
 * alone would rank higher but there isn't the evidence yet.
 */
export function hypeRank(score: number, total: number, previous: Rank = 'unseen', since: Date | null = null, now = new Date()):
  { rank: Rank; early: boolean } {
  let byScore = 0
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].min) byScore = i
  // Stay at the previous rank while the score is only just under its floor.
  const prev = index(previous)
  if (prev > byScore && score >= RANKS[prev].min - HYPE_RULES.hysteresis) byScore = prev

  let i = byScore
  while (i > 0 && total < RANKS[i].evidence) i--
  const early = i < byScore
  const legendary = index('legendary')
  if (i === legendary) {
    const held = previous === 'legendary' || (previous === 'iconic' && since != null && now.getTime() - since.getTime() >= HYPE_RULES.legendaryAfterDays * 86_400_000)
    if (!held) i = index('iconic')
  }
  return { rank: RANKS[i].key, early }
}

export const rankLabel = (rank: Rank) => RANKS[index(rank)]?.label ?? 'Unseen'
export const isRank = (v: unknown): v is Rank => RANKS.some((r) => r.key === v)
export const rose = (from: Rank, to: Rank) => index(to) > index(from)
