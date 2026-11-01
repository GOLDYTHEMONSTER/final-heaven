// The early access offer's rules (lib/early-access) and the welcome that carries it.
import { describe, expect, it } from 'vitest'
import { EARLY_ACCESS, earlyEndsAt, earlyPercent, inviteLink, isEarly, parseInvite } from '@/lib/early-access'
import { fillEarly, needsEarly, welcomeEmail } from '@/lib/email/lifecycle'
import { triggerContent } from '@/lib/email/reachout'

describe('early access rules', () => {
  it('starts at 25%, adds 5% a credit, and stops at 35%', () => {
    expect([0, 1, 2, 3, 10, -1].map(earlyPercent)).toEqual([25, 30, 35, 35, 35, 25])
    expect(EARLY_ACCESS.freeMembershipMonths).toBe(2)
  })

  it('ends at the end of the 30th day after launch, and has no end while there is no launch day', () => {
    expect(earlyEndsAt('2026-11-20')).toBe('2026-12-20T23:59:59+01:00')
    expect(earlyEndsAt(null)).toBeNull()
  })

  it('is early until launch day', () => {
    expect(isEarly(null, '2026-11-01')).toBe(true)
    expect(isEarly('2026-11-20', '2026-11-19')).toBe(true)
    expect(isEarly('2026-11-20', '2026-11-20')).toBe(false)
  })

  it('reads an invite code and builds the link', () => {
    expect(parseInvite(' fhab12cd ')).toBe('FHAB12CD')
    expect(parseInvite('<script>')).toBeNull()
    expect(parseInvite(42)).toBeNull()
    expect(inviteLink('https://s.test/', 'FHAB12CD')).toBe('https://s.test/?invite=FHAB12CD')
  })
})

describe('the early access welcome', () => {
  const early = { code: 'FHAB12CD', percent: 30, inviteLink: 'https://s.test/?invite=FHAB12CD' }
  const render = (e: typeof early | null) =>
    welcomeEmail({ source: 'launch_waitlist', site: 'https://s.test', unsubscribeUrl: 'https://s.test/unsubscribe?token=T', reason: 'you joined', early: e })

  it('carries the person’s code, percent and invite link, in html and text', () => {
    const e = render(early)
    for (const part of [e.html, e.text]) {
      expect(part).toContain('30% off your first order')
      expect(part).toContain('FHAB12CD')
      expect(part).toContain('https://s.test/?invite=FHAB12CD')
      expect(part).toContain('2 months of membership free')
      expect(part).not.toMatch(/\{(code|percent|invite_link)\}/)
    }
  })

  it('is the plain welcome without a code', () => {
    expect(render(null).text).not.toContain('first order')
  })

  it('the held batch copy keeps placeholders until it is sent', () => {
    const c = triggerContent('welcome_backfill', 'launch_waitlist', true)
    expect(needsEarly(c.body)).toBe(true)
    expect(needsEarly(triggerContent('welcome_backfill', 'launch_waitlist').body)).toBe(false)
    expect(fillEarly(c.body, early)).toContain('30% off your first order with your code FHAB12CD')
  })
})
