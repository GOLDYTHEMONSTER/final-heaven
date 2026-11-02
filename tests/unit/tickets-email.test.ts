import { describe, expect, it, vi } from 'vitest'
import { ticketsEmail, type TicketEmailData } from '@/lib/email/tickets'
import { deliverQueuedEmails, type EmailDeps, type EmailStore, type FinishResult, type OutboxRow } from '@/lib/email/outbox'

const site = 'https://s.test'
const T: TicketEmailData = {
  email: 'ada@customer.test', name: 'Ada <script>x</script>', orderNumber: 'FHT-AB12CD', accessToken: 'f'.repeat(32),
  total: '45000.00', currency: 'NGN', status: 'confirmed', timeZone: 'Africa/Lagos',
  event: { title: 'Launch <Night>', startsAt: '2026-11-21T19:00:00Z', venue: 'The Warehouse', address: '1 Test St, Lagos' },
  tickets: [{ token: 'a'.repeat(32), code: 'k7m42q', type: 'VIP' }, { token: 'b'.repeat(32), code: 'p3x9zt', type: 'Regular' }],
}

describe('the ticket email', () => {
  it('has the event, every ticket’s QR code and door code, and the link to the tickets', () => {
    const r = ticketsEmail(T, site)
    expect(r.subject).toBe('Your 2 tickets: Launch <Night>')
    expect(r.html).toContain(`${site}/api/tickets/${'a'.repeat(32)}/qr`)
    expect(r.html).toContain('K7M 42Q')
    expect(r.html).toContain(`${site}/tickets/${'f'.repeat(32)}`)
    expect(r.html).toContain('Sat 21 November at 8:00 pm')
    expect(r.text).toContain(`Open your tickets: ${site}/tickets/${'f'.repeat(32)}`)
    expect(r.text).toContain('VIP (1 of 2): K7M 42Q')
    expect(r.text).toContain('Regular (2 of 2): P3X 9ZT')
  })

  it('escapes the buyer’s name and the event title', () => {
    const r = ticketsEmail(T, site)
    expect(r.html).not.toContain('<script>')
    expect(r.html).toContain('Ada &lt;script&gt;')
    expect(r.html).toContain('Launch &lt;Night&gt;')
  })

  it('says “ticket” for one', () => {
    expect(ticketsEmail({ ...T, tickets: [T.tickets[0]] }, site).subject).toBe('Your ticket: Launch <Night>')
  })
})

describe('the ticket email in the outbox', () => {
  function setup(t: TicketEmailData | null) {
    const finished: { id: number; result: FinishResult }[] = []
    const send = vi.fn(async () => ({ id: 'em_1' }))
    const store: EmailStore = {
      claim: vi.fn(async () => [{ id: 1, tenantId: 't1', kind: 'tickets.issued', orderId: null, messageId: null, subscriberId: null, alertId: null, ticketOrderId: 'to1', dedupeKey: 'tickets.issued:to1', attempts: 1 } as OutboxRow]),
      loadOrder: vi.fn(async () => null), loadMessage: vi.fn(async () => null), loadReply: vi.fn(async () => null),
      loadSubscriber: vi.fn(async () => null), loadAlert: vi.fn(async () => null),
      loadTicketOrder: vi.fn(async () => t),
      suppressed: vi.fn(async () => false),
      finish: vi.fn(async (id, result) => { finished.push({ id, result }) }),
    }
    const deps: EmailDeps = { store, sender: { send }, log: () => {}, pauseMs: 0, config: { from: 'Final Heaven <hello@x.test>', replyTo: 'help@x.test', staffTo: [], siteUrl: `${site}/` } }
    return { deps, finished, send }
  }

  it('goes to the buyer, keyed by its dedupe key', async () => {
    const { deps, send } = setup(T)
    expect(await deliverQueuedEmails(deps)).toMatchObject({ sent: 1 })
    expect(send.mock.calls[0]).toMatchObject([{ to: ['ada@customer.test'], replyTo: 'help@x.test' }, 'tickets.issued:to1'])
  })

  it('is skipped for a cancelled or missing order', async () => {
    for (const t of [{ ...T, status: 'cancelled' as const }, null]) {
      const { deps, send, finished } = setup(t)
      expect(await deliverQueuedEmails(deps)).toMatchObject({ skipped: 1, sent: 0 })
      expect(send).not.toHaveBeenCalled()
      expect(finished[0].result.status).toBe('skipped')
    }
  })
})
