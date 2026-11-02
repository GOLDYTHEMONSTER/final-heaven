// The staff digest: when it is skipped, what it says, and that customer text is escaped.
import { describe, expect, it } from 'vitest'
import { digestIsEmpty, staffDigestEmail, topReasons, type DigestData } from '@/lib/email/digest'

const ZERO: DigestData = {
  paid: { count: 0, total: 0, currency: 'NGN' }, messages: 0, subscribers: {}, lowStock: [],
  emailsFailed: 0, emailsSkipped: 0, emailProblems: [], bounces: 0, complaints: 0,
}
const render = (d: DigestData) => staffDigestEmail(d, { site: 'https://s.test', day: '2026-11-10' })

describe('skipping an empty digest', () => {
  it('is empty only when every figure is zero', () => {
    expect(digestIsEmpty(ZERO)).toBe(true)
    expect(digestIsEmpty({ ...ZERO, subscribers: { footer: 0 } })).toBe(true)
    for (const busy of [
      { paid: { count: 1, total: 100, currency: 'NGN' } }, { messages: 1 }, { subscribers: { footer: 1 } },
      { lowStock: [{ id: 'p', name: 'P', stock: 0 }] }, { emailsFailed: 1 }, { emailsSkipped: 1 }, { bounces: 1 }, { complaints: 1 },
    ]) expect(digestIsEmpty({ ...ZERO, ...busy })).toBe(false)
  })
})

describe('the digest email', () => {
  const busy: DigestData = {
    paid: { count: 2, total: 51000, currency: 'NGN' }, messages: 3, subscribers: { launch_waitlist: 4, footer: 1 },
    lowStock: [{ id: 'p1', name: 'Rose <Tank>', stock: 1 }, { id: 'p2', name: 'Ghost', stock: 0 }],
    emailsFailed: 1, emailsSkipped: 2, emailProblems: [{ reason: 'address is suppressed', count: 2 }], bounces: 1, complaints: 0,
  }
  const e = render(busy)

  it('reports every figure, naming the lists', () => {
    expect(e.subject).toBe('Daily digest, 2026-11-10: 2 paid orders')
    for (const part of [e.html, e.text]) {
      expect(part).toContain('51,000')
      expect(part).toContain('Launch waitlist 4')
      expect(part).toContain('Newsletter 1')
      expect(part).toContain('1 / 2') // failed / skipped
      expect(part).toContain('1 / 0') // bounces / complaints
    }
    expect(e.text).toContain('- Rose <Tank>: 1 left')
    expect(e.text).toContain('- Ghost: sold out')
    expect(e.text).toContain('address is suppressed (2)')
  })

  it('escapes product names, goes through the store layout and links the Studio', () => {
    expect(e.html).toContain('Rose &lt;Tank&gt;')
    expect(e.html).toContain('neon-mark.gif')
    expect(e.html).toContain('https://s.test/studio')
  })

  it('has a plain subject on a day with no paid orders', () => {
    expect(render({ ...ZERO, messages: 2 }).subject).toBe('Daily digest, 2026-11-10')
    expect(render({ ...busy, paid: { count: 1, total: 5, currency: 'NGN' } }).subject).toMatch(/1 paid order$/)
  })
})

describe('topReasons', () => {
  it('groups and ranks reasons, and names missing ones', () => {
    expect(topReasons(['a', 'b', 'a', null, 'a', 'b'])).toEqual([
      { reason: 'a', count: 3 }, { reason: 'b', count: 2 }, { reason: 'no reason recorded', count: 1 },
    ])
    expect(topReasons(['a', 'b', 'c', 'd'], 2)).toHaveLength(2)
  })
})

describe('event tickets in the digest', () => {
  it('counts as activity and gets its own line', () => {
    expect(digestIsEmpty({ ...ZERO, tickets: { count: 0, total: 0 } })).toBe(true)
    expect(digestIsEmpty({ ...ZERO, tickets: { count: 3, total: 45000 } })).toBe(false)
    const e = render({ ...ZERO, tickets: { count: 3, total: 45000 } })
    expect(e.text).toContain('Tickets sold')
    expect(e.text).toContain('3 · ₦45,000.00')
    expect(render(ZERO).text).not.toContain('Tickets sold')
  })
})
