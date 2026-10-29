// Unfinished-checkout reminder: scheduling rules, the email, cancelling, and the Resend calls. Nothing is sent.
import { describe, expect, it, vi } from 'vitest'
import { checkoutReminderEmail } from '@/lib/email/lifecycle'
import { cancelCheckoutReminder, REMINDER_DELAY_MS, scheduleCheckoutReminder, type ClaimResult, type ReminderDeps, type ReminderStore } from '@/lib/email/reminders'
import { createResendSender } from '@/lib/email/resend'
import { withReminderCancel } from '@/lib/payments'
import type { PaymentStore } from '@/lib/payments/service'

const NOW = new Date('2026-11-10T10:00:00Z')
const ITEMS = [{ name: 'Rose Tank <b>', quantity: 2, size: 'M', color: 'black', price: 17000 }]

function setup(over: { claim?: ClaimResult; suppressed?: boolean; sender?: ReminderDeps['sender']; scheduled?: Awaited<ReturnType<ReminderStore['scheduled']>> } = {}) {
  const store: ReminderStore = {
    checkout: vi.fn(async () => ({ id: 'c1', tenantId: 't1', email: 'ada@x.test', items: ITEMS, currency: 'NGN', total: '34000.00' })),
    suppressed: vi.fn(async () => over.suppressed ?? false),
    claim: vi.fn(async () => over.claim ?? 'ok'),
    saved: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    scheduled: vi.fn(async () => over.scheduled ?? { emailId: 'em_sched', cancelledAt: null }),
    markCancelled: vi.fn(async () => {}),
  }
  const sender = over.sender === undefined ? { send: vi.fn(async () => ({ id: 'em_sched' })), cancel: vi.fn(async () => {}) } : over.sender
  const deps: ReminderDeps = { store, sender, now: () => NOW, log: () => {}, config: { from: 'FH <a@x.test>', replyTo: 'help@x.test', staffTo: [], siteUrl: 'https://s.test/' } }
  return { deps, store, sender: sender as NonNullable<typeof sender> & { send: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } }
}

describe('scheduling the reminder', () => {
  it('schedules one email two hours ahead, keyed by the checkout, and stores the Resend id', async () => {
    const { deps, store, sender } = setup()
    expect(await scheduleCheckoutReminder(deps, 'c1', { paymentsOpen: true })).toBe('scheduled')
    const [email, key] = sender.send.mock.calls[0]
    expect(key).toBe('checkout-reminder:c1')
    expect(email).toMatchObject({ to: ['ada@x.test'], replyTo: 'help@x.test', scheduledAt: new Date(NOW.getTime() + REMINDER_DELAY_MS).toISOString() })
    expect(new Date(email.scheduledAt).getTime() - NOW.getTime()).toBe(2 * 3_600_000)
    expect(store.saved).toHaveBeenCalledWith('c1', 'em_sched')
  })

  it('does nothing while checkout is closed or email is not set up', async () => {
    const closed = setup()
    expect(await scheduleCheckoutReminder(closed.deps, 'c1', { paymentsOpen: false })).toBe('checkout_closed')
    expect(closed.sender.send).not.toHaveBeenCalled()
    const off = setup({ sender: null })
    expect(await scheduleCheckoutReminder(off.deps, 'c1', { paymentsOpen: true })).toBe('not_configured')
  })

  it('skips suppressed addresses without taking a place', async () => {
    const { deps, store, sender } = setup({ suppressed: true })
    expect(await scheduleCheckoutReminder(deps, 'c1', { paymentsOpen: true })).toBe('suppressed')
    expect(store.claim).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it.each(['recent', 'capped', 'duplicate', 'closed'] as const)('sends nothing when the limits say %s', async (claim) => {
    const { deps, sender } = setup({ claim })
    expect(await scheduleCheckoutReminder(deps, 'c1', { paymentsOpen: true })).toBe(claim)
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('gives the place back if Resend refuses, so a later attempt can still schedule', async () => {
    const { deps, store } = setup({ sender: { send: vi.fn(async () => { throw new Error('Resend 429') }) } })
    expect(await scheduleCheckoutReminder(deps, 'c1', { paymentsOpen: true })).toBe('failed')
    expect(store.release).toHaveBeenCalledWith('c1')
    expect(store.saved).not.toHaveBeenCalled()
  })
})

describe('the reminder email', () => {
  const e = checkoutReminderEmail({ items: ITEMS, currency: 'NGN', total: '34000.00', site: 'https://s.test' })

  it('lists the cart, links back to checkout, and says what to do if they already paid', () => {
    expect(e.html).toContain('Rose Tank &lt;b&gt;') // escaped
    expect(e.html).toContain('× 2')
    expect(e.html).toContain('https://s.test/checkout')
    expect(e.text).toContain('Back to checkout: https://s.test/checkout')
    for (const part of [e.html, e.text]) expect(part).toMatch(/already paid, ignore this email/)
    expect(e.html).toContain('neon-mark.gif')
  })
})

describe('cancelling the reminder', () => {
  it('cancels the scheduled email and records it', async () => {
    const { deps, store, sender } = setup()
    expect(await cancelCheckoutReminder(deps, 'c1')).toBe('cancelled')
    expect(sender.cancel).toHaveBeenCalledWith('em_sched')
    expect(store.markCancelled).toHaveBeenCalledWith('c1')
  })

  it('has nothing to do when none was scheduled or it was already cancelled', async () => {
    expect(await cancelCheckoutReminder(setup({ scheduled: { emailId: null, cancelledAt: null } }).deps, 'c1')).toBe('none')
    const done = setup({ scheduled: { emailId: 'em', cancelledAt: NOW.toISOString() } })
    expect(await cancelCheckoutReminder(done.deps, 'c1')).toBe('already_cancelled')
    expect(done.sender.cancel).not.toHaveBeenCalled()
  })

  it('reports a failed cancel without throwing (the email itself says to ignore it if paid)', async () => {
    const { deps, store } = setup({ sender: { send: vi.fn(), cancel: vi.fn(async () => { throw new Error('Resend 422: already sent') }) } })
    expect(await cancelCheckoutReminder(deps, 'c1')).toBe('failed')
    expect(store.markCancelled).not.toHaveBeenCalled()
  })
})

describe('Resend scheduled sending and cancel', () => {
  it('sends scheduled_at, and cancels with POST /emails/{id}/cancel', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'em_9' }), { status: 200 }))
    const sender = createResendSender({ apiKey: 're_k', fetchImpl })
    await sender.send({ from: 'a@x.test', to: ['b@x.test'], subject: 's', html: 'h', text: 't', scheduledAt: '2026-11-10T12:00:00.000Z' }, 'checkout-reminder:c1')
    expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ scheduled_at: '2026-11-10T12:00:00.000Z' })
    await sender.cancel!('em_9')
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails/em_9/cancel')
    expect(init.method).toBe('POST')
  })

  it('throws when Resend refuses the cancel', async () => {
    const sender = createResendSender({ apiKey: 'k', fetchImpl: vi.fn(async () => new Response(JSON.stringify({ message: 'already sent' }), { status: 422 })) })
    await expect(sender.cancel!('em_9')).rejects.toThrow(/422/)
  })
})

describe('cancelling when the payment is confirmed', () => {
  const inner = (outcome: string, checkoutId: string | null = 'c1') => ({
    applyVerified: vi.fn(async () => outcome),
    getByReference: vi.fn(async () => ({ checkoutId })),
  }) as unknown as PaymentStore
  const tx = { reference: 'FHP-1' } as never

  it('cancels after an applied payment, whichever path confirmed it', async () => {
    const cancel = vi.fn(async () => {})
    for (const outcome of ['applied', 'already_applied', 'applied_to_cancelled_order']) {
      expect(await withReminderCancel(inner(outcome), cancel).applyVerified(tx)).toBe(outcome)
    }
    expect(cancel).toHaveBeenCalledTimes(3)
    expect(cancel).toHaveBeenCalledWith('c1')
  })

  it('leaves the reminder alone when the payment did not succeed, and never breaks the payment', async () => {
    const cancel = vi.fn(async () => {})
    await withReminderCancel(inner('failed_recorded'), cancel).applyVerified(tx)
    await withReminderCancel(inner('pending'), cancel).applyVerified(tx)
    expect(cancel).not.toHaveBeenCalled()
    const broken = vi.fn(async () => { throw new Error('boom') })
    expect(await withReminderCancel(inner('applied'), broken).applyVerified(tx)).toBe('applied')
  })
})
