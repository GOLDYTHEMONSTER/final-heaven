// Resend adapter, templates and outbox delivery, with fakes. Nothing is sent.
import { describe, expect, it, vi } from 'vitest'
import { createResendSender, EmailError, type EmailSender, type OutgoingEmail } from '@/lib/email/resend'
import { escapeHtml, orderPaidEmail, staffMessageEmail, staffOrderPaidEmail, type OrderEmailData } from '@/lib/email/templates'
import { deliverQueuedEmails, MAX_EMAIL_ATTEMPTS, type EmailDeps, type EmailStore, type FinishResult, type OutboxRow } from '@/lib/email/outbox'

const ORDER: OrderEmailData = {
  orderNumber: 'FH-ABC123', email: 'ada@customer.test', total: '24999.90', currency: 'NGN',
  items: [{ name: 'Ember Runner <b>', quantity: 2, size: '42', price: 12499.95 }],
  trackingNumber: 'TRK-XYZ', shippingCity: 'Lagos', shippingState: 'Lagos', shippingCarrier: null, shippingReference: null,
  status: 'confirmed',
}

describe('Resend adapter', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))
  const email: OutgoingEmail = { from: 'Final Heaven <orders@x.test>', to: ['a@b.test'], subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', replyTo: 'help@x.test' }

  it('sends with the bearer key, idempotency key and snake_case reply_to', async () => {
    const fetchImpl = ok({ id: 'em_1' })
    const sender = createResendSender({ apiKey: 're_test', fetchImpl })
    expect(await sender.send(email, 'order.paid:1')).toEqual({ id: 'em_1' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer re_test')
    expect(headers['Idempotency-Key']).toBe('order.paid:1')
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ['a@b.test'], reply_to: 'help@x.test' })
  })

  it('marks quota, auth and server errors retryable, validation errors final', async () => {
    const fail = async (status: number) =>
      createResendSender({ apiKey: 'k', fetchImpl: ok({ message: 'nope' }, status) }).send(email, 'k').then(() => { throw new Error('expected a failure') }, (e: EmailError) => e)
    expect((await fail(429)).retryable).toBe(true)
    expect((await fail(403)).retryable).toBe(true) // e.g. domain not verified yet
    expect((await fail(500)).retryable).toBe(true)
    expect((await fail(422)).retryable).toBe(false)
  })

  it('treats a network failure as retryable', async () => {
    const sender = createResendSender({ apiKey: 'k', fetchImpl: vi.fn(async () => { throw new TypeError('fetch failed') }) })
    await expect(sender.send(email, 'k')).rejects.toMatchObject({ retryable: true })
  })
})

describe('templates', () => {
  it('escapes customer-supplied values', () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;')
    const m = staffMessageEmail({ name: 'Eve\n<img src=x>', email: 'eve@x.test', topic: 'order', orderNumber: null, message: '<a href="evil">hi</a> there' }, 'https://s.test')
    expect(m.html).not.toContain('<img src=x>')
    expect(m.html).not.toContain('<a href="evil">')
    expect(m.subject).not.toMatch(/[\r\n]/)
  })

  it('receipt carries items, total, tracking link and a plain-text part', () => {
    const r = orderPaidEmail(ORDER, 'https://s.test')
    expect(r.subject).toBe('Payment received for order FH-ABC123')
    expect(r.html).toContain('Ember Runner &lt;b&gt;')
    expect(r.html).toContain('₦24,999.90')
    expect(r.html).toContain('https://s.test/track-order?orderNumber=FH-ABC123')
    expect(r.text).toContain('Total paid: ₦24,999.90')
  })

  it('flags a payment on a cancelled order for refund', () => {
    expect(staffOrderPaidEmail({ ...ORDER, status: 'cancelled' }, 'https://s.test').subject).toMatch(/refund needed/)
  })
})

describe('outbox delivery', () => {
  function setup(rows: OutboxRow[], sender: EmailSender | null = { send: vi.fn(async () => ({ id: 'em_1' })) }, staffTo = ['owner@x.test']) {
    const finished: { id: number; result: FinishResult }[] = []
    const store: EmailStore = {
      claim: vi.fn(async () => rows),
      loadOrder: vi.fn(async () => ORDER),
      loadMessage: vi.fn(async () => ({ name: 'Ada', email: 'ada@customer.test', topic: 'return', orderNumber: null, message: 'Hello there, a question.' })),
      finish: vi.fn(async (id, result) => { finished.push({ id, result }) }),
    }
    const deps: EmailDeps = {
      store, sender, log: () => {}, pauseMs: 0,
      config: { from: 'Final Heaven <orders@x.test>', replyTo: 'help@x.test', staffTo, siteUrl: 'https://s.test/' },
    }
    return { deps, store, finished, sender }
  }
  const row = (id: number, kind: OutboxRow['kind'], extra: Partial<OutboxRow> = {}): OutboxRow =>
    ({ id, kind, orderId: kind === 'staff.message' ? null : 'o1', messageId: kind === 'staff.message' ? 'm1' : null, dedupeKey: `${kind}:${id}`, attempts: 1, ...extra })

  it('does nothing and leaves rows queued when email is not configured', async () => {
    const { deps, store } = setup([row(1, 'order.paid')], null)
    expect(await deliverQueuedEmails(deps)).toMatchObject({ configured: false, sent: 0 })
    expect(store.claim).not.toHaveBeenCalled()
  })

  it('sends the receipt to the customer with the dedupe key as idempotency key', async () => {
    const { deps, finished, sender } = setup([row(1, 'order.paid')])
    expect(await deliverQueuedEmails(deps)).toMatchObject({ sent: 1 })
    const [email, key] = (sender!.send as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(email).toMatchObject({ to: ['ada@customer.test'], replyTo: 'help@x.test' })
    expect(key).toBe('order.paid:1')
    expect(finished[0].result).toEqual({ status: 'sent', providerMessageId: 'em_1' })
  })

  it('routes staff alerts to the staff address with reply-to the customer, or skips them if none is set', async () => {
    const a = setup([row(1, 'staff.message')])
    await deliverQueuedEmails(a.deps)
    expect((a.sender!.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ to: ['owner@x.test'], replyTo: 'ada@customer.test' })

    const b = setup([row(2, 'staff.order_paid')], undefined, [])
    expect(await deliverQueuedEmails(b.deps)).toMatchObject({ skipped: 1, sent: 0 })
    expect(b.finished[0].result).toMatchObject({ status: 'skipped' })
  })

  it('records failures, final only when a retry cannot help, and keeps going', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new EmailError('Resend 429: daily quota', true, 429))
      .mockRejectedValueOnce(new EmailError('Resend 422: invalid to', false, 422))
      .mockResolvedValueOnce({ id: 'em_3' })
    const { deps, finished } = setup([row(1, 'order.paid'), row(2, 'order.paid'), row(3, 'order.paid')], { send })
    expect(await deliverQueuedEmails(deps)).toMatchObject({ sent: 1, failed: 2 })
    expect(finished.map((f) => f.result)).toEqual([
      { status: 'failed', error: 'Resend 429: daily quota', final: false },
      { status: 'failed', error: 'Resend 422: invalid to', final: true },
      { status: 'sent', providerMessageId: 'em_3' },
    ])
    expect(deps.store.finish).toHaveBeenCalledWith(2, expect.anything(), MAX_EMAIL_ATTEMPTS)
  })

  it('never throws, even if claiming fails', async () => {
    const { deps } = setup([])
    deps.store.claim = vi.fn(async () => { throw new Error('db down') })
    await expect(deliverQueuedEmails(deps)).resolves.toMatchObject({ sent: 0 })
  })
})
