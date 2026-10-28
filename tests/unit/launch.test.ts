import { describe, expect, it } from 'vitest'
import { launchState, zonedMidnight } from '@/lib/launch'

describe('launch state', () => {
  it('counts down to midnight Lagos time on opening day', () => {
    expect(zonedMidnight('2026-11-20', 'Africa/Lagos').toISOString()).toBe('2026-11-19T23:00:00.000Z')
    expect(launchState({ paymentsOpenOn: '2026-11-20', purchasesPaused: false }, 'Africa/Lagos', '2026-10-28'))
      .toEqual({ open: false, opensOn: '2026-11-20', opensAt: '2026-11-19T23:00:00.000Z' })
  })

  it('has no countdown while the day isn’t set', () => {
    expect(launchState({ paymentsOpenOn: null, purchasesPaused: false }, 'Africa/Lagos', '2026-10-28'))
      .toEqual({ open: false, opensOn: null, opensAt: null })
  })

  it('is open from opening day, and a later pause doesn’t bring the gate back', () => {
    expect(launchState({ paymentsOpenOn: '2026-11-20', purchasesPaused: false }, 'Africa/Lagos', '2026-11-20').open).toBe(true)
    expect(launchState({ paymentsOpenOn: '2026-11-20', purchasesPaused: true }, 'Africa/Lagos', '2026-12-01').open).toBe(true)
  })
})
