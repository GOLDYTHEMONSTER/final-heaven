// Welcome email: who gets one, what it says by source, and how the outbox sends it.
import { describe, expect, it, vi } from 'vitest'
import { LAUNCH_WINDOW } from '@/lib/catalog'
import { welcomeDecision, welcomeEmail } from '@/lib/email/lifecycle'
import { deliverQueuedEmails, type EmailDeps, type EmailStore, type FinishResult, type OutboxRow, type SubscriberEmailData } from '@/lib/email/outbox'

const NOW = new Date('2026-11-10T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('who gets a welcome', () => {
  it('new addresses do; people already on the list pressing the button again do not', () => {
    expect(welcomeDecision(null, NOW).welcome).toBe(true)
    expect(welcomeDecision({ unsubscribedAt: null }, NOW).welcome).toBe(false)
  })

  it('a re-subscribe within 30 days does not; after 30 days it is a fresh occasion with its own key', () => {
    expect(welcomeDecision({ unsubscribedAt: days(29) }, NOW)).toEqual({ welcome: false, keySuffix: '' })
    const later = welcomeDecision({ unsubscribedAt: days(31) }, NOW)
    expect(later.welcome).toBe(true)
    expect(later.keySuffix).toBe(days(31).slice(0, 10))
  })
})

describe('welcome copy', () => {
  const render = (source: string | null) => welcomeEmail({ source, site: 'https://s.test', unsubscribeUrl: 'https://s.test/unsubscribe?token=T', reason: 'you joined the list' })

  it('depends on the list, and the launch waitlist is told the public launch window', () => {
    expect(render('launch_waitlist').html).toContain(LAUNCH_WINDOW)
    expect(render('membership_waitlist').text).toMatch(/membership/i)
    expect(render('footer').subject).toBe('Welcome to Final Heaven')
    expect(render('something_else').subject).toBe('Welcome to Final Heaven') // unknown source falls back to the newsletter
  })

  it('is in the store layout and carries the unsubscribe link, in both html and text', () => {
    const e = render('footer')
    expect(e.html).toContain('neon-mark.gif')
    expect(e.html).toContain('https://s.test/unsubscribe?token=T')
    expect(e.text).toContain('Unsubscribe: https://s.test/unsubscribe?token=T')
    expect(e.html).toContain('https://s.test/shop')
  })
})

describe('outbox sends the welcome', () => {
  const row: OutboxRow = { id: 1, tenantId: 't1', kind: 'subscriber.welcome', orderId: null, messageId: null, subscriberId: 's1', alertId: null, dedupeKey: 'subscriber.welcome:s1', attempts: 1 }
  function run(sub: SubscriberEmailData | null, suppressed = false) {
    const finished: FinishResult[] = []
    const send = vi.fn(async () => ({ id: 'em_w' }))
    const store = {
      claim: async () => [row], loadSubscriber: async () => sub, suppressed: async () => suppressed,
      finish: async (_id: number, r: FinishResult) => { finished.push(r) },
    } as unknown as EmailStore
    const deps: EmailDeps = { store, sender: { send }, log: () => {}, pauseMs: 0, config: { from: 'FH <a@x.test>', replyTo: null, staffTo: [], siteUrl: 'https://s.test' } }
    return { deps, send, finished }
  }
  const sub: SubscriberEmailData = { email: 'ada@x.test', source: 'launch_waitlist', unsubscribeToken: 'tok-1', unsubscribed: false }

  it('sends it with one-click unsubscribe headers and the dedupe key', async () => {
    const { deps, send } = run(sub)
    expect(await deliverQueuedEmails(deps)).toMatchObject({ sent: 1 })
    const [email, key] = send.mock.calls[0] as unknown as [{ to: string[]; headers: Record<string, string> }, string]
    expect(email.to).toEqual(['ada@x.test'])
    expect(email.headers['List-Unsubscribe']).toBe('<https://s.test/api/newsletter/unsubscribe?token=tok-1>')
    expect(key).toBe('subscriber.welcome:s1')
  })

  it('skips if they unsubscribed meanwhile, were deleted, or are suppressed', async () => {
    for (const r of [run({ ...sub, unsubscribed: true }), run(null), run(sub, true)]) {
      expect(await deliverQueuedEmails(r.deps)).toMatchObject({ skipped: 1, sent: 0 })
      expect(r.send).not.toHaveBeenCalled()
    }
  })
})
