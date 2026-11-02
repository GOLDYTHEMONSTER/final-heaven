import { describe, expect, it } from 'vitest'
import { launchState, openingInstant, zonedMidnight } from '@/lib/launch'
import { clockLabel, launchTime, paymentsClosed, paymentsState, storeMoment } from '@/lib/catalog'
import { isEarly } from '@/lib/early-access'

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

describe('a launch time (Sat 7 Nov, 9 pm Lagos)', () => {
  const shop = { paymentsOpenOn: '2026-11-07', paymentsOpenTime: '21:00', purchasesPaused: false }

  it('stays closed on launch day until the time, then opens', () => {
    expect(paymentsState(shop, '2026-11-07T20:59')).toMatchObject({ open: false, closedFor: 'launch', opensOn: '2026-11-07', opensTime: '21:00' })
    expect(paymentsState(shop, '2026-11-07T21:00').open).toBe(true)
    expect(paymentsState(shop, '2026-11-08T00:01').open).toBe(true)
    // A bare day (no clock) is read as its first minute: still closed on launch day.
    expect(paymentsState(shop, '2026-11-07').open).toBe(false)
  })

  it('without a time it opens at midnight, as before', () => {
    expect(paymentsState({ ...shop, paymentsOpenTime: null }, '2026-11-07T00:00').open).toBe(true)
    expect(paymentsState({ ...shop, paymentsOpenTime: null }, '2026-11-06T23:59').open).toBe(false)
  })

  it('counts down to 9 pm Lagos (20:00 UTC), and says so', () => {
    expect(openingInstant('2026-11-07', '21:00', 'Africa/Lagos').toISOString()).toBe('2026-11-07T20:00:00.000Z')
    expect(launchState(shop, 'Africa/Lagos', '2026-11-02T22:35')).toEqual({ open: false, opensOn: '2026-11-07', opensAt: '2026-11-07T20:00:00.000Z' })
    expect(paymentsClosed(paymentsState(shop, '2026-11-02T22:35')).message).toBe('Checkout opens on 7 November 2026 at 9 pm.')
  })

  it('reads the store clock in Lagos time', () => {
    expect(storeMoment('Africa/Lagos', new Date('2026-11-07T19:59:30Z'))).toBe('2026-11-07T20:59')
    expect(storeMoment('Africa/Lagos', new Date('2026-11-07T20:00:00Z'))).toBe('2026-11-07T21:00')
  })

  it('waitlist sign-ups are early until the launch time', () => {
    expect(isEarly('2026-11-07', '2026-11-07T20:59', '21:00')).toBe(true)
    expect(isEarly('2026-11-07', '2026-11-07T21:00', '21:00')).toBe(false)
    expect(isEarly('2026-11-07', '2026-11-07T10:00')).toBe(false)
  })

  it('a launch time must be HH:MM', () => {
    expect(launchTime('21:00')).toBe('21:00')
    for (const bad of ['9pm', '24:00', '21:60', '', null, 2100]) expect(launchTime(bad)).toBeNull()
    expect(clockLabel('21:00')).toBe('9 pm')
    expect(clockLabel('09:30')).toBe('9:30 am')
    expect(clockLabel('00:00')).toBe('12 am')
  })
})
