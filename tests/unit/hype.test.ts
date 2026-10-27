// Hype scores and ranks (lib/hype).
import { describe, expect, it } from 'vitest'
import { HYPE_RULES, RANKS, hypeRank, hypeScore, rose } from '@/lib/hype'

const DAY = 86_400_000
const now = new Date('2026-11-20T12:00:00Z')

describe('hype score', () => {
  it('is 0 with no hypes, and the first hypes count most', () => {
    expect(hypeScore({ total: 0, last7: 0 })).toBe(0)
    const one = hypeScore({ total: 1, last7: 1 })
    const ten = hypeScore({ total: 10, last7: 10 })
    expect(one).toBeGreaterThan(0)
    expect(ten - hypeScore({ total: 9, last7: 9 })).toBeLessThan(one)
  })

  it('stays within 0-100 and falls as momentum fades', () => {
    expect(hypeScore({ total: 100_000, last7: 100_000 })).toBe(100)
    expect(hypeScore({ total: 200, last7: 0 })).toBeLessThan(hypeScore({ total: 200, last7: 40 }))
  })
})

describe('hype rank', () => {
  it('follows the ladder when there is evidence for it', () => {
    expect(hypeRank(0, 0).rank).toBe('unseen')
    expect(hypeRank(12, 3).rank).toBe('emerging')
    expect(hypeRank(30, 8).rank).toBe('buzzing')
    expect(hypeRank(45, 20).rank).toBe('trending')
    expect(hypeRank(65, 50).rank).toBe('elite')
    expect(hypeRank(80, 100).rank).toBe('iconic')
  })

  it('a high score from a few hypes says early instead of claiming the rank', () => {
    expect(hypeRank(94, 4)).toEqual({ rank: 'emerging', early: true })
    expect(hypeRank(30, 8)).toEqual({ rank: 'buzzing', early: false })
  })

  it('does not drop for a point or two (no flicker), but does drop for real', () => {
    expect(hypeRank(59, 50, 'elite').rank).toBe('elite') // floor 60, within the buffer
    expect(hypeRank(60 - HYPE_RULES.hysteresis - 0.1, 50, 'elite').rank).toBe('trending')
    expect(hypeRank(59, 50, 'trending').rank).toBe('trending') // rising still needs the full floor
  })

  it('Legendary waits until Iconic has been held for a week', () => {
    expect(hypeRank(95, 300, 'iconic', new Date(now.getTime() - 2 * DAY), now).rank).toBe('iconic')
    expect(hypeRank(95, 300, 'iconic', new Date(now.getTime() - 8 * DAY), now).rank).toBe('legendary')
    expect(hypeRank(95, 300, 'trending', null, now).rank).toBe('iconic')
    expect(hypeRank(91, 300, 'legendary', null, now).rank).toBe('legendary')
  })

  it('knows when a rank rose', () => {
    expect(rose('iconic', 'legendary')).toBe(true)
    expect(rose('elite', 'trending')).toBe(false)
    expect(RANKS).toHaveLength(7)
  })
})
