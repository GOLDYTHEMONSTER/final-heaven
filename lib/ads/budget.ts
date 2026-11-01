// The test budget for the three Meta campaigns (docs/erp/07-reachout.md).
//
//   daily budget = target conversions × expected cost per conversion ÷ test days
//
// shared 70 / 20 / 10 across Prospecting, Retention and Retargeting. Pure: whole
// units of whatever currency the ad account uses, no rounding surprises (the
// shares always add up to the daily budget).

export const CAMPAIGNS = ['Prospecting', 'Retention', 'Retargeting'] as const
export type Campaign = (typeof CAMPAIGNS)[number]

/** Percent of the budget each campaign gets: finding new people, warm people who haven't bought, then people who looked at a product. */
export const SPLIT: Record<Campaign, number> = { Prospecting: 70, Retention: 20, Retargeting: 10 }

export type BudgetInput = { targetConversions: number; expectedCpa: number; testDays: number }
export type Budget = {
  /** What the whole test is expected to cost. */
  total: number
  /** Rounded up to a whole unit, so the test reaches its target. */
  daily: number
  split: { campaign: Campaign; percent: number; daily: number }[]
}

export const LIMITS = { targetConversions: { min: 1, max: 100_000 }, expectedCpa: { min: 1, max: 100_000_000 }, testDays: { min: 1, max: 90 } }

/** A sentence for the first input that can't be used, or null. */
export function budgetProblem(input: BudgetInput): string | null {
  const fields: [keyof BudgetInput, string][] = [['targetConversions', 'Target conversions'], ['expectedCpa', 'Expected cost per conversion'], ['testDays', 'Test days']]
  for (const [key, label] of fields) {
    const v = input[key]
    const { min, max } = LIMITS[key]
    if (!Number.isInteger(v) || v < min || v > max) return `${label} must be a whole number between ${min.toLocaleString('en-GB')} and ${max.toLocaleString('en-GB')}.`
  }
  return null
}

/** The daily budget and its 70 / 20 / 10 split; null when an input is invalid (see budgetProblem). */
export function dailyBudget(input: BudgetInput): Budget | null {
  if (budgetProblem(input)) return null
  const total = input.targetConversions * input.expectedCpa
  const daily = Math.ceil(total / input.testDays)
  // Whole units: give each campaign its share rounded down, then hand the remainder to the largest fractions.
  const exact = CAMPAIGNS.map((c) => ({ campaign: c, percent: SPLIT[c], exact: (daily * SPLIT[c]) / 100 }))
  const shares = exact.map((e) => ({ ...e, daily: Math.floor(e.exact) }))
  let left = daily - shares.reduce((t, s) => t + s.daily, 0)
  for (const s of [...shares].sort((a, b) => (b.exact - b.daily) - (a.exact - a.daily))) {
    if (left <= 0) break
    s.daily += 1
    left -= 1
  }
  return { total, daily, split: shares.map(({ campaign, percent, daily: d }) => ({ campaign, percent, daily: d })) }
}
