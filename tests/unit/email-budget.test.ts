// The Resend budget: how much marketing may still go out, why it stops, and what an approval costs.
import { describe, expect, it } from 'vitest'
import { MARKETING_DAILY, MARKETING_MONTHLY_STOP, marketingAllowance, marketingPause, parseUsage, quotaImpact, usageLine, type EmailUsage } from '@/lib/email/budget'

const usage = (today: [number, number], month: [number, number]): EmailUsage => ({
  today: { total: today[0], marketing: today[1] }, month: { total: month[0], marketing: month[1] },
})

describe('marketing allowance', () => {
  it('is 60 a day on a quiet day', () => {
    expect(marketingAllowance(usage([0, 0], [0, 0]))).toBe(MARKETING_DAILY)
  })

  it('shrinks with what marketing already sent today', () => {
    expect(marketingAllowance(usage([30, 25], [30, 25]))).toBe(35)
    expect(marketingAllowance(usage([60, 60], [60, 60]))).toBe(0)
  })

  it('leaves room for receipts: marketing never takes the plan’s 100th email', () => {
    expect(marketingAllowance(usage([90, 20], [90, 20]))).toBe(10)
    expect(marketingAllowance(usage([100, 10], [100, 10]))).toBe(0)
  })

  it('stops for the month at 2,700', () => {
    expect(marketingAllowance(usage([0, 0], [2690, 2690]))).toBe(10)
    expect(marketingAllowance(usage([0, 0], [2700, 2700]))).toBe(0)
    expect(marketingPause(usage([0, 0], [2700, 2700]))).toMatch(/paused for the month/)
  })

  it('says why it is paused for the day, and nothing when it can send', () => {
    expect(marketingPause(usage([60, 60], [60, 60]))).toMatch(/60 marketing sends are used/)
    expect(marketingPause(usage([100, 10], [100, 10]))).toMatch(/100 emails are used/)
    expect(marketingPause(usage([5, 0], [5, 0]))).toBeNull()
  })
})

describe('what approving costs', () => {
  it('a batch that fits finishes today', () => {
    const q = quotaImpact(16, usage([0, 0], [0, 0]))
    expect(q).toMatchObject({ today: 16, days: 1 })
    expect(q.text).toBe('Uses 16 of today’s 60 marketing sends, finishes today.')
  })

  it('a bigger one spreads over days, 60 at a time', () => {
    const q = quotaImpact(200, usage([0, 0], [0, 0]))
    expect(q).toMatchObject({ today: 60, days: 4 }) // 60 today, then 60, 60, 20
    expect(q.text).toContain('spreads over 4 days')
  })

  it('counts what is already queued ahead of it, and what was used today', () => {
    expect(quotaImpact(30, usage([20, 20], [20, 20]), 20)).toMatchObject({ today: 20, days: 2 })
    expect(quotaImpact(10, usage([60, 60], [60, 60]))).toMatchObject({ today: 0, days: 1 })
  })

  it('warns when the month’s limit is the constraint, and handles an empty batch', () => {
    expect(quotaImpact(50, usage([0, 0], [2680, 2680])).text).toContain(`${MARKETING_MONTHLY_STOP.toLocaleString('en-GB')}`)
    expect(quotaImpact(0, usage([0, 0], [0, 0])).text).toBe('Nobody is in this batch.')
  })
})

describe('the ledger’s figures', () => {
  it('reads what the database returns, and survives nonsense', () => {
    expect(parseUsage({ today: { total: 7, marketing: 3 }, month: { total: 1240, marketing: 800 } })).toEqual(usage([7, 3], [1240, 800]))
    expect(parseUsage(null)).toEqual(usage([0, 0], [0, 0]))
    expect(parseUsage({ today: { total: 'x' } })).toEqual(usage([0, 0], [0, 0]))
  })

  it('shows the header line the Outbox uses', () => {
    expect(usageLine(usage([42, 10], [1240, 900]))).toBe('1,240 of 3,000 this month · 42 of 100 today')
  })
})
