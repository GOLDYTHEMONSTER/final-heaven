// Support: the reference, the acknowledgement and reply emails, and the built-in saved replies. Nothing is sent.
import { describe, expect, it, vi } from 'vitest'
import { REFERENCE_PATTERN, defaultSavedReplies, fillReply, mergeSavedReplies, newSupportReference, replySubject, SUPPORT_REPLY_TIME } from '@/lib/support'
import { supportAckEmail, supportReplyEmail } from '@/lib/email/support'
import { deliverQueuedEmails, type EmailDeps, type EmailStore, type OutboxRow } from '@/lib/email/outbox'
import { POLICY } from '@/lib/legal'
import { DELIVERY } from '@/lib/delivery'

const MESSAGE = { name: 'Eve <script>', email: 'eve@x.test', topic: 'order', orderNumber: 'FH-ABC123', message: 'Where is it?\n<img src=x onerror=alert(1)>', reference: 'FH-7K2Q' }

describe('support reference', () => {
  it('looks like FH- and four characters, without the ones that are easily misread', () => {
    for (let i = 0; i < 200; i++) {
      const ref = newSupportReference()
      expect(ref).toMatch(REFERENCE_PATTERN)
      expect(ref.slice(3)).not.toMatch(/[01OIL]/)
    }
  })

  it('is built from the random bytes it is given', () => {
    expect(newSupportReference(() => new Uint8Array([0, 1, 2, 31]))).toBe('FH-ABCA')
  })

  it('varies between calls', () => {
    expect(new Set(Array.from({ length: 50 }, () => newSupportReference())).size).toBeGreaterThan(40)
  })
})

describe('support emails', () => {
  it('the acknowledgement gives the reference and when to expect an answer, and escapes the customer’s words', () => {
    const e = supportAckEmail(MESSAGE, 'https://s.test')
    expect(e.subject).toBe('We’ve got your message [FH-7K2Q]')
    expect(e.html).toContain('FH-7K2Q')
    expect(e.html).toContain(SUPPORT_REPLY_TIME)
    expect(e.html).toContain('Hi Eve,') // first name only
    expect(e.html).not.toContain('<img src=x')
    expect(e.html).not.toContain('<script>')
    expect(e.text).toContain(`Reference: FH-7K2Q`)
    expect(e.text).toContain('https://s.test/track-order')
  })

  it('the acknowledgement still works for a message with no reference', () => {
    expect(supportAckEmail({ ...MESSAGE, reference: null }, 'https://s.test').subject).toBe('We’ve got your message')
  })

  it('the reply is “Re: <topic> [reference]”, one line, with the staff text and the original escaped', () => {
    const e = supportReplyEmail(MESSAGE, 'Hi <b>Eve</b>\nIt shipped.', 'https://s.test')
    expect(e.subject).toBe('Re: About an order [FH-7K2Q]')
    expect(e.html).toContain('Hi &lt;b&gt;Eve&lt;/b&gt;')
    expect(e.html).not.toContain('<b>Eve</b>')
    expect(e.html).not.toContain('<img src=x')
    expect(e.text).toContain('It shipped.')
    expect(replySubject('General enquiry\r\nBcc: x', null)).not.toMatch(/[\r\n]/)
  })
})

describe('outbox delivery of support emails', () => {
  const setup = () => {
    const send = vi.fn(async () => ({ id: 'em_1' }))
    const store = {
      claim: async () => rows,
      loadMessage: async () => MESSAGE,
      loadReply: async () => ({ body: 'On its way.', message: MESSAGE }),
      suppressed: async () => false,
      finish: vi.fn(async () => {}),
    } as unknown as EmailStore
    const deps: EmailDeps = { store, sender: { send }, log: () => {}, pauseMs: 0, config: { from: 'Final Heaven <hello@x.test>', replyTo: 'help@x.test', staffTo: [], siteUrl: 'https://s.test/' } }
    return { deps, send }
  }
  const base = { tenantId: 't1', orderId: null, subscriberId: null, alertId: null, attempts: 1 }
  const rows: OutboxRow[] = [
    { ...base, id: 1, kind: 'support.ack', messageId: 'm1', replyId: null, dedupeKey: 'support.ack:m1' },
    { ...base, id: 2, kind: 'support.reply', messageId: null, replyId: 'r1', dedupeKey: 'support.reply:r1' },
  ]

  it('sends both to the customer from the configured sender, with the configured reply-to', async () => {
    const { deps, send } = setup()
    expect(await deliverQueuedEmails(deps)).toMatchObject({ sent: 2 })
    const calls = send.mock.calls as unknown as [Record<string, unknown>, string][]
    expect(calls[0][0]).toMatchObject({ from: 'Final Heaven <hello@x.test>', to: ['eve@x.test'], replyTo: 'help@x.test' })
    expect(calls[1][0]).toMatchObject({ to: ['eve@x.test'], replyTo: 'help@x.test', subject: 'Re: About an order [FH-7K2Q]' })
    expect(calls[1][1]).toBe('support.reply:r1')
  })
})

describe('saved replies', () => {
  const defaults = defaultSavedReplies('https://s.test/')

  it('has the five built-ins', () => {
    expect(defaults.map((r) => r.key)).toEqual(['where_is_my_order', 'sizing', 'delivery_time', 'returns', 'payment_failed'])
  })

  it('takes its numbers from the store’s own policy and delivery rules', () => {
    const returns = defaults.find((r) => r.key === 'returns')!.body
    expect(returns).toContain(`${POLICY.returnWindowDays} days`)
    expect(returns).toContain(`${POLICY.refundProcessingDays} business days`)
    const delivery = defaults.find((r) => r.key === 'delivery_time')!.body
    expect(delivery).toContain(`${DELIVERY.inStock.min}–${DELIVERY.inStock.max} days`)
    expect(delivery).toContain(`${DELIVERY.fromChina.min}–${DELIVERY.fromChina.max} days`)
  })

  it('fills the name, order number and tracking link', () => {
    const body = defaults.find((r) => r.key === 'where_is_my_order')!.body
    const filled = fillReply(body, { name: 'Ada Obi', orderNumber: 'FH-ABC123', site: 'https://s.test/' })
    expect(filled).toContain('Hi Ada,')
    expect(filled).toContain('FH-ABC123')
    expect(filled).toContain('https://s.test/track-order?orderNumber=FH-ABC123')
    expect(filled).not.toMatch(/\{(name|order|track)\}/)
    expect(fillReply(body, { name: '', orderNumber: null, site: 'https://s.test' })).toContain('https://s.test/track-order\n')
  })

  it('lets the store’s edit replace a built-in, and adds the store’s own', () => {
    const merged = mergeSavedReplies(defaults, [
      { id: 'a', key: 'sizing', title: 'Sizing (ours)', body: 'Ours.' },
      { id: 'b', key: null, title: 'Thanks', body: 'Thanks!' },
    ])
    expect(merged).toHaveLength(6)
    expect(merged.find((r) => r.key === 'sizing')!.body).toBe('Ours.')
    expect(merged.at(-1)!.title).toBe('Thanks')
  })
})
