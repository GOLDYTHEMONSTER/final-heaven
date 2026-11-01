// The marketing triggers: who qualifies for each held email, and the rules they all follow.
import { describe, expect, it } from 'vitest'
import {
  MARKETING_GAP_DAYS, TRIGGERS, eligible, launchDue, lowStockViewedDue, nurtureDue, reviewAskDue, triggerContent, viewedTwiceDue, welcomeBackfillDue, winbackDue,
  type BatchTrigger, type Gate, type Person,
} from '@/lib/email/reachout'
import { campaignProblems } from '@/lib/email/campaign'

const NOW = new Date('2026-11-10T09:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const person = (id: string, over: Partial<Person> = {}): Person => ({
  id, email: `${id}@x.test`, source: 'footer', subscribedAt: daysAgo(4), consentedAt: daysAgo(4), unsubscribedAt: null, ...over,
})
const gate = (over: Partial<Gate> = {}): Gate => ({ now: NOW, suppressed: new Set(), lastContact: new Map(), had: new Set(), ...over })
const due = (p: Person) => ({ person: p, productId: null, why: 'test' })
const ids = (d: { person: Person }[]) => d.map((x) => x.person.id)

describe('the rules every marketing email follows', () => {
  it('only consented, still-subscribed people', () => {
    const list = [person('a'), person('b', { consentedAt: null }), person('c', { unsubscribedAt: daysAgo(1) })]
    expect(ids(eligible(list.map(due), gate()))).toEqual(['a'])
  })

  it('never a suppressed address, whatever its case', () => {
    expect(ids(eligible([due(person('a', { email: 'Bounced@X.test' })), due(person('b'))], gate({ suppressed: new Set(['bounced@x.test']) })))).toEqual(['b'])
  })

  it('at most one marketing email per person every 3 days', () => {
    const last = (days: number) => new Map([['a', new Date(NOW.getTime() - days * 86_400_000)]])
    expect(eligible([due(person('a'))], gate({ lastContact: last(2.9) }))).toHaveLength(0)
    expect(eligible([due(person('a'))], gate({ lastContact: last(MARKETING_GAP_DAYS) }))).toHaveLength(1)
    expect(eligible([due(person('a'))], gate({ lastContact: last(10) }))).toHaveLength(1)
  })

  it('a trigger is not repeated to someone who already has it, and a person is listed once', () => {
    expect(eligible([due(person('a'))], gate({ had: new Set(['a']) }))).toHaveLength(0)
    expect(eligible([due(person('a')), due(person('a'))], gate())).toHaveLength(1)
  })
})

describe('M1 welcome backfill', () => {
  it('is everyone who was never welcomed', () => {
    const people = [person('a'), person('b'), person('c')]
    expect(ids(welcomeBackfillDue(people, new Set(['b'])))).toEqual(['a', 'c'])
  })
})

describe('M3 and M4 nurture', () => {
  const buyers = new Set(['bought@x.test'])
  it('M3 goes to people subscribed 3 to 10 days, who have not ordered', () => {
    const people = [person('new', { subscribedAt: daysAgo(1) }), person('three', { subscribedAt: daysAgo(3.2) }), person('old', { subscribedAt: daysAgo(40) }), person('bought', { subscribedAt: daysAgo(5) })]
    expect(ids(nurtureDue('nurture_3d', people, buyers, NOW))).toEqual(['three'])
  })
  it('M4 goes to people subscribed 7 to 14 days', () => {
    const people = [person('six', { subscribedAt: daysAgo(6) }), person('eight', { subscribedAt: daysAgo(8) }), person('bought', { subscribedAt: daysAgo(8) })]
    expect(ids(nurtureDue('nurture_7d', people, buyers, NOW))).toEqual(['eight'])
  })
})

describe('M5 launch', () => {
  it('is the launch waitlist only', () => {
    const people = [person('a', { source: 'launch_waitlist' }), person('b', { source: 'footer' }), person('c', { source: 'membership_waitlist' })]
    expect(ids(launchDue(people))).toEqual(['a'])
  })
  it('promises the month and no day', () => {
    const c = triggerContent('launch')
    expect(c.body).toMatch(/November/)
    expect(c.body).not.toMatch(/\b\d{1,2}(st|nd|rd|th)?\s+(of\s+)?November|November\s+\d{1,2}\b/i)
  })
})

describe('R1 and R2 retargeting', () => {
  const people = new Map([['a', person('a')], ['b', person('b')]])
  const view = (subscriberId: string, productId: string, days: number) => ({ subscriberId, productId, at: daysAgo(days) })

  it('R1: the same piece twice in 7 days, not bought; the most viewed piece wins', () => {
    const views = [view('a', 'p1', 1), view('a', 'p1', 3), view('a', 'p2', 2), view('b', 'p1', 1), view('b', 'p3', 20), view('b', 'p3', 21)]
    const out = viewedTwiceDue(views, people, new Map(), NOW)
    expect(out.map((d) => [d.person.id, d.productId])).toEqual([['a', 'p1']])
  })

  it('R1: skips a piece they have already bought', () => {
    const views = [view('a', 'p1', 1), view('a', 'p1', 2)]
    expect(viewedTwiceDue(views, people, new Map([['a', new Set(['p1'])]]), NOW)).toEqual([])
  })

  it('R2: a recent view of a piece that is now low', () => {
    const views = [view('a', 'low', 2), view('a', 'plenty', 1), view('b', 'low', 12)]
    const out = lowStockViewedDue(views, people, new Set(['low']), new Map(), NOW)
    expect(out.map((d) => [d.person.id, d.productId])).toEqual([['a', 'low']])
  })

  it('does nothing without views (none can be linked to a subscriber yet)', () => {
    expect(viewedTwiceDue([], people, new Map(), NOW)).toEqual([])
    expect(lowStockViewedDue([], people, new Set(['low']), new Map(), NOW)).toEqual([])
  })
})

describe('W1, W2, W3 win-back', () => {
  const people = [person('a', { email: 'a@x.test' }), person('b', { email: 'b@x.test' })]

  it('W1: delivered 21 to 28 days ago, linked to a subscriber by email', () => {
    const orders = [
      { email: 'A@x.test', deliveredAt: daysAgo(22), productId: 'p1' },
      { email: 'b@x.test', deliveredAt: daysAgo(10), productId: 'p2' },
      { email: 'stranger@x.test', deliveredAt: daysAgo(22), productId: 'p3' },
    ]
    const out = reviewAskDue(orders, people, NOW)
    expect(out.map((d) => [d.person.id, d.productId])).toEqual([['a', 'p1']])
  })

  it('W2 and W3: judged on the latest order, so a recent order cancels the old one', () => {
    const orders = [
      { email: 'a@x.test', paidAt: daysAgo(125), productId: null },
      { email: 'b@x.test', paidAt: daysAgo(125), productId: null },
      { email: 'b@x.test', paidAt: daysAgo(20), productId: null },
    ]
    expect(ids(winbackDue('winback_120', orders, people, NOW))).toEqual(['a'])
    expect(winbackDue('winback_180', orders, people, NOW)).toEqual([])
    expect(ids(winbackDue('winback_180', [{ email: 'a@x.test', paidAt: daysAgo(185), productId: null }], people, NOW))).toEqual(['a'])
  })
})

describe('the copy', () => {
  const all = Object.keys(TRIGGERS) as BatchTrigger[]

  it('every trigger has a starting email that is ready to approve', () => {
    for (const t of all) {
      const c = triggerContent(t, 'footer')
      expect(campaignProblems({ ...c, audience: ['footer'] }), t).toEqual([])
    }
  })

  it('the welcome reuses the list’s existing welcome words', () => {
    expect(triggerContent('welcome', 'launch_waitlist').subject).toBe('You’re on the Final Heaven waitlist')
    expect(triggerContent('welcome_backfill', null).subject).toBe('Welcome to Final Heaven')
  })

  it('has a code from the plan for each trigger', () => {
    expect(all.map((t) => TRIGGERS[t].code).sort()).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'R1', 'R2', 'W1', 'W2', 'W3'])
  })
})
