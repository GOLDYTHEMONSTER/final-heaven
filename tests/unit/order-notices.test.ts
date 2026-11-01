// The delivered and refunded notices (S3, S4), and the digest line for held batches (T4).
import { describe, expect, it } from 'vitest'
import { orderDeliveredEmail, orderRefundedEmail, type OrderEmailData } from '@/lib/email/templates'
import { digestIsEmpty, staffDigestEmail, type DigestData } from '@/lib/email/digest'

const order: OrderEmailData = {
  orderNumber: 'FH-1042', email: 'ada@x.test', total: 51000, currency: 'NGN', items: [], trackingNumber: 'TRK-1',
  shippingCity: 'Lagos', shippingState: 'Lagos', shippingCarrier: null, shippingReference: null, status: 'delivered', paymentStatus: 'refunded',
}
const site = 'https://s.test'

describe('delivered notice', () => {
  const e = orderDeliveredEmail(order, site)
  it('names the order, links tracking and the returns window', () => {
    expect(e.subject).toBe('Your order FH-1042 has been delivered')
    for (const part of [e.html, e.text]) {
      expect(part).toContain('FH-1042')
      expect(part).toContain('/track-order?orderNumber=FH-1042')
      expect(part).toContain('7 days')
      expect(part).toContain('/returns')
    }
  })
  it('is a service email: no unsubscribe, no marketing', () => {
    expect(e.html).not.toMatch(/unsubscribe/i)
    expect(e.html).toContain('neon-mark.gif')
  })
})

describe('refund notice', () => {
  it('says refund for a full refund and partial refund for a part', () => {
    const full = orderRefundedEmail(order, site)
    const part = orderRefundedEmail({ ...order, paymentStatus: 'partially_refunded' }, site)
    expect(full.subject).toBe('A refund for order FH-1042')
    expect(part.subject).toBe('A partial refund for order FH-1042')
    expect(part.text).toContain('partial refund')
    expect(full.text).not.toContain('partial')
  })
  it('promises no amount or date it does not know', () => {
    const e = orderRefundedEmail(order, site)
    expect(e.html).not.toContain('51,000')
    expect(e.text).not.toMatch(/\d+ (business )?days/)
  })
  it('escapes the order number', () => {
    expect(orderRefundedEmail({ ...order, orderNumber: '<b>X</b>' }, site).html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })
})

describe('held batches in the digest', () => {
  const ZERO: DigestData = {
    paid: { count: 0, total: 0, currency: 'NGN' }, messages: 0, subscribers: {}, lowStock: [],
    emailsFailed: 0, emailsSkipped: 0, emailProblems: [], bounces: 0, complaints: 0,
  }
  it('are worth a digest on their own, and not when there are none', () => {
    expect(digestIsEmpty({ ...ZERO, heldBatches: 0 })).toBe(true)
    expect(digestIsEmpty({ ...ZERO, heldBatches: 2 })).toBe(false)
  })
  it('add a line that points at the Outbox', () => {
    const e = staffDigestEmail({ ...ZERO, heldBatches: 2 }, { site, day: '2026-11-10' })
    expect(e.text).toContain('Emails waiting for your OK: 2 (Studio → Outbox)')
    expect(staffDigestEmail(ZERO, { site, day: '2026-11-10' }).text).not.toContain('waiting for your OK')
  })
})
