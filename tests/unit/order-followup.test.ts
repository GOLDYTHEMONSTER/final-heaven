// The delivered follow-up email and the outbox sending it. Nothing is sent.
import { describe, expect, it, vi } from 'vitest'
import { orderFollowupEmail } from '@/lib/email/lifecycle'
import { deliverQueuedEmails, type EmailDeps, type EmailStore, type FinishResult, type OutboxRow } from '@/lib/email/outbox'
import type { OrderEmailData } from '@/lib/email/templates'

const ORDER: OrderEmailData = {
  orderNumber: 'FH-XYZ', email: 'ada@x.test', total: '50000', currency: 'NGN', status: 'delivered',
  items: [
    { name: 'Rose Tank <b>', quantity: 2, size: 'M', color: 'black', price: 17000, productId: 'p1' },
    { name: 'Free pendant', quantity: 1, size: null, price: 0, gift: true, productId: 'p9' },
    { name: 'Old line', quantity: 1, size: null, price: 5, productId: null },
  ],
  trackingNumber: 'TRK', shippingCity: null, shippingState: null, shippingCarrier: null, shippingReference: null,
}

describe('the follow-up email', () => {
  const e = orderFollowupEmail(ORDER, 'https://s.test')

  it('links each paid piece to its page, escaped, and skips gifts and lines without a product', () => {
    expect(e.html).toContain('https://s.test/product/p1')
    expect(e.html).toContain('Rose Tank &lt;b&gt;')
    expect(e.html).not.toContain('/product/p9')
    expect(e.html).not.toContain('Old line')
    expect(e.text).toContain('- Rose Tank <b>: https://s.test/product/p1')
  })

  it('asks how it fits, points to Hype and returns, and builds no review form', () => {
    expect(e.subject).toBe('How’s it fitting?')
    expect(e.text).toMatch(/Hype/)
    expect(e.text).toMatch(/return/)
    expect(e.html).not.toMatch(/<form|<input|star/i)
    expect(e.html).toContain('neon-mark.gif')
  })

  it('still reads well for an old order whose lines have no product ids', () => {
    const old = orderFollowupEmail({ ...ORDER, items: [ORDER.items[2]] }, 'https://s.test')
    expect(old.html).toContain('https://s.test/shop')
  })
})

describe('outbox sends order.followup', () => {
  const row: OutboxRow = { id: 1, tenantId: 't1', kind: 'order.followup', orderId: 'o1', messageId: null, subscriberId: null, alertId: null, dedupeKey: 'order.followup:o1', attempts: 1 }
  function run(order: OrderEmailData | null) {
    const finished: FinishResult[] = []
    const send = vi.fn(async () => ({ id: 'em_f' }))
    const store = { claim: async () => [row], loadOrder: async () => order, suppressed: async () => false, finish: async (_i: number, r: FinishResult) => { finished.push(r) } } as unknown as EmailStore
    const deps: EmailDeps = { store, sender: { send }, log: () => {}, pauseMs: 0, config: { from: 'FH <a@x.test>', replyTo: 'help@x.test', staffTo: [], siteUrl: 'https://s.test' } }
    return { deps, send }
  }

  it('sends it to the customer, keyed by the order', async () => {
    const r = run(ORDER)
    expect(await deliverQueuedEmails(r.deps)).toMatchObject({ sent: 1 })
    const [email, key] = r.send.mock.calls[0] as unknown as [{ to: string[] }, string]
    expect(email.to).toEqual(['ada@x.test'])
    expect(key).toBe('order.followup:o1')
  })

  it('skips an order that is no longer delivered, or gone', async () => {
    for (const o of [{ ...ORDER, status: 'cancelled' }, null]) {
      const r = run(o)
      expect(await deliverQueuedEmails(r.deps)).toMatchObject({ skipped: 1, sent: 0 })
      expect(r.send).not.toHaveBeenCalled()
    }
  })
})
