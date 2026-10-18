// Payment workflows with an in-memory store and a scripted provider.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmPayment, handleWebhook, reconcile, startPayment,
  type ApplyOutcome, type Deps, type PaymentRecord, type PaymentStore,
} from '@/lib/payments/service'
import { ProviderError, type PaymentProvider, type VerifiedTransaction } from '@/lib/payments/types'

const REF = 'FHP-AAAA1111BBBB'

function memoryStore() {
  const payments = new Map<string, PaymentRecord>()
  const events: { id: string; dedupeKey: string; status: string; attempts: number; eventType: string; providerTransactionId: string | null; reference: string | null }[] = []
  const applied: VerifiedTransaction[] = []
  const store: PaymentStore = {
    async findReusableAttempt(target) {
      return [...payments.values()].find((p) => (target.kind === 'checkout' ? p.checkoutId : p.orderId) === target.id
        && p.checkoutUrl && ['initiated', 'pending'].includes(p.status)) ?? null
    },
    async createAttempt(a) {
      payments.set(a.reference, { id: `pay-${payments.size + 1}`, reference: a.reference, tenantId: a.target.tenantId,
        orderId: a.target.kind === 'order' ? a.target.id : null, checkoutId: a.target.kind === 'checkout' ? a.target.id : null,
        orderNumber: 'FH-1', amountMinor: a.amountMinor, currency: a.currency, status: 'initiated', checkoutUrl: null, createdAt: new Date().toISOString() })
    },
    async setCheckoutUrl(reference, url) { payments.get(reference)!.checkoutUrl = url },
    async recordInitFailure() {},
    async getByReference(reference) { return payments.get(reference) ?? null },
    async applyVerified(tx): Promise<ApplyOutcome> {
      applied.push(tx)
      const p = payments.get(tx.reference)
      if (!p) return 'unknown_reference'
      if (p.status === 'successful') return 'already_applied'
      if (tx.status === 'successful') {
        if (tx.currency !== p.currency) return 'rejected_currency'
        if ((tx.amountMinor ?? -1) < p.amountMinor) return 'rejected_amount'
        p.status = 'successful'
        return 'applied'
      }
      return tx.status === 'pending' ? 'pending' : 'failed_recorded'
    },
    async storeEvent(e) {
      if (events.some((x) => x.dedupeKey === e.dedupeKey)) return { id: '', duplicate: true }
      const id = `ev-${events.length + 1}`
      events.push({ id, dedupeKey: e.dedupeKey, status: 'received', attempts: 0, eventType: e.eventType, providerTransactionId: e.providerTransactionId, reference: e.reference })
      return { id, duplicate: false }
    },
    async finishEvent(id, r) { const e = events.find((x) => x.id === id)!; e.status = r.status; e.attempts += 1 },
    async eventBacklog(limit, max) {
      return events.filter((e) => ['received', 'failed'].includes(e.status) && e.attempts < max).slice(0, limit)
        .map((e) => ({ id: e.id, eventType: e.eventType, providerTransactionId: e.providerTransactionId, reference: e.reference, attempts: e.attempts }))
    },
    async stalePayments() { return [...payments.values()].filter((p) => ['initiated', 'pending'].includes(p.status)) },
    async markAbandoned(reference) { payments.get(reference)!.status = 'abandoned' },
  }
  return { store, payments, events, applied }
}

const verified = (o: Partial<VerifiedTransaction> = {}): VerifiedTransaction => ({
  providerTransactionId: '777', reference: REF, status: 'successful', amountMinor: 2499990, currency: 'NGN', failureReason: null, ...o,
})

function fakeProvider(o: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: 'flutterwave',
    initiate: vi.fn(async () => ({ checkoutUrl: 'https://checkout.flutterwave.com/pay/1' })),
    verifyByTransactionId: vi.fn(async () => verified()),
    verifyByReference: vi.fn(async () => verified()),
    verifyWebhookSignature: vi.fn((h: Headers) => h.get('verif-hash') === 'good'),
    parseWebhook: vi.fn((b: any) => b?.event
      ? { type: b.event, providerTransactionId: String(b.data?.id ?? ''), reference: b.data?.tx_ref ?? null, status: b.data?.status ?? null, dedupeKey: `${b.event}:${b.data?.id}:${b.data?.status}` }
      : null),
    ...o,
  }
}

let mem: ReturnType<typeof memoryStore>
let provider: PaymentProvider
let deps: Deps
const order = { kind: 'checkout' as const, id: 'chk-1', tenantId: 't1', amountMinor: 2499990, currency: 'NGN', email: 'c@x.co', description: 'Final Heaven order' }
const seedPayment = async () => { await mem.store.createAttempt({ target: { kind: 'checkout', id: 'chk-1', tenantId: 't1' }, reference: REF, amountMinor: 2499990, currency: 'NGN', provider: 'flutterwave' }) }
const webhookBody = (status = 'successful', id = 777) => JSON.stringify({ event: 'charge.completed', data: { id, tx_ref: REF, status, amount: 1, currency: 'NGN' } })

beforeEach(() => {
  mem = memoryStore()
  provider = fakeProvider()
  deps = { store: mem.store, provider, log: () => {} }
})

describe('starting a payment', () => {
  it('reuses a recent checkout link instead of creating a second one', async () => {
    const first = await startPayment(deps, order, 'https://shop.test')
    const second = await startPayment(deps, order, 'https://shop.test')
    expect(first.ok && second.ok && second.reused).toBe(true)
    expect(provider.initiate).toHaveBeenCalledTimes(1)
  })

  it('on a timeout it reports the problem and does NOT retry by itself', async () => {
    provider = fakeProvider({ initiate: vi.fn(async () => { throw new ProviderError('timeout', true) }) })
    deps.provider = provider
    const res = await startPayment(deps, order, 'https://shop.test')
    expect(res).toMatchObject({ ok: false, reason: 'provider_unavailable' })
    expect(provider.initiate).toHaveBeenCalledTimes(1)
  })

  it('without provider keys, payment is reported as not configured', async () => {
    expect(await startPayment({ ...deps, provider: null }, order, 'https://shop.test')).toEqual({ ok: false, reason: 'not_configured' })
  })
})

describe('webhooks', () => {
  it('an invalid signature is rejected and nothing is stored or applied', async () => {
    const res = await handleWebhook(deps, new Headers({ 'verif-hash': 'bad' }), webhookBody())
    expect(res.httpStatus).toBe(401)
    expect(mem.events).toHaveLength(0)
    expect(mem.applied).toHaveLength(0)
  })

  it('a valid event is stored, re-verified with the provider, and applied', async () => {
    await seedPayment()
    const res = await handleWebhook(deps, new Headers({ 'verif-hash': 'good' }), webhookBody())
    expect(res.httpStatus).toBe(200)
    expect(provider.verifyByTransactionId).toHaveBeenCalledWith('777')
    expect(mem.payments.get(REF)!.status).toBe('successful')
    expect(mem.events[0].status).toBe('processed')
  })

  it('the webhook body is never trusted: a payload claiming success is checked against the API', async () => {
    await seedPayment()
    provider.verifyByTransactionId = vi.fn(async () => verified({ status: 'failed', amountMinor: null }))
    await handleWebhook(deps, new Headers({ 'verif-hash': 'good' }), webhookBody('successful'))
    expect(mem.payments.get(REF)!.status).not.toBe('successful')
  })

  it('duplicate deliveries are acknowledged but processed once', async () => {
    await seedPayment()
    const h = new Headers({ 'verif-hash': 'good' })
    await handleWebhook(deps, h, webhookBody())
    const again = await handleWebhook(deps, h, webhookBody())
    expect(again.body).toMatchObject({ duplicate: true })
    expect(mem.applied).toHaveLength(1)
  })

  it('if the provider is down during processing, the event is kept and the reconcile job completes it', async () => {
    await seedPayment()
    provider.verifyByTransactionId = vi.fn(async () => { throw new ProviderError('down', true) })
    const res = await handleWebhook(deps, new Headers({ 'verif-hash': 'good' }), webhookBody())
    expect(res.httpStatus).toBe(200) // stored durably; we own the retry now
    expect(mem.events[0].status).toBe('failed')

    provider.verifyByTransactionId = vi.fn(async () => verified())
    const summary = await reconcile(deps)
    expect(summary.eventsRetried).toBe(1)
    expect(mem.payments.get(REF)!.status).toBe('successful')
  })

  it('if the event cannot even be stored, Flutterwave is told to retry (500)', async () => {
    mem.store.storeEvent = async () => { throw new Error('db down') }
    const res = await handleWebhook(deps, new Headers({ 'verif-hash': 'good' }), webhookBody())
    expect(res.httpStatus).toBe(500)
  })

  it('events for references we never created are ignored, not applied', async () => {
    const res = await handleWebhook(deps, new Headers({ 'verif-hash': 'good' }), webhookBody())
    expect(res.httpStatus).toBe(200)
    expect(mem.events[0].status).toBe('ignored')
  })
})

describe('confirming after redirect', () => {
  it('ignores the redirect status and asks the provider', async () => {
    await seedPayment()
    const res = await confirmPayment(deps, REF, '777')
    expect(provider.verifyByTransactionId).toHaveBeenCalledWith('777')
    expect(res).toMatchObject({ ok: true, outcome: 'applied' })
  })

  it('refuses someone else’s successful transaction id for this order', async () => {
    await seedPayment()
    provider.verifyByTransactionId = vi.fn(async () => verified({ reference: 'FHP-SOMEONEELSE0' }))
    const res = await confirmPayment(deps, REF, '999')
    expect(res).toEqual({ ok: false, reason: 'reference_mismatch' })
    expect(mem.payments.get(REF)!.status).toBe('initiated')
  })

  it('wrong currency or short amounts are not applied as paid', async () => {
    await seedPayment()
    provider.verifyByTransactionId = vi.fn(async () => verified({ currency: 'USD' }))
    expect(await confirmPayment(deps, REF, '777')).toMatchObject({ outcome: 'rejected_currency' })
    provider.verifyByTransactionId = vi.fn(async () => verified({ amountMinor: 100 }))
    expect(await confirmPayment(deps, REF, '777')).toMatchObject({ outcome: 'rejected_amount' })
    expect(mem.payments.get(REF)!.status).toBe('initiated')
  })
})

describe('reconciliation', () => {
  it('abandons payments the provider never saw after 24 hours, and leaves recent ones alone', async () => {
    await seedPayment()
    provider.verifyByReference = vi.fn(async () => null)
    mem.payments.get(REF)!.createdAt = new Date(Date.now() - 25 * 3_600_000).toISOString()
    expect((await reconcile(deps)).abandoned).toBe(1)
    expect(mem.payments.get(REF)!.status).toBe('abandoned')
  })

  it('applies a success the webhook never delivered', async () => {
    await seedPayment()
    const summary = await reconcile(deps)
    expect(summary.outcomes.applied).toBe(1)
  })
})
