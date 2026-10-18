// The Flutterwave adapter against a fake fetch: no network, no real keys.
import { describe, expect, it, vi } from 'vitest'
import { createFlutterwaveProvider, safeEqual } from '@/lib/payments/flutterwave'
import { ProviderError } from '@/lib/payments/types'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function provider(fetchImpl: typeof fetch) {
  return createFlutterwaveProvider({ secretKey: 'FLWSECK_TEST-x', webhookSecretHash: 'hash-123', fetchImpl, timeoutMs: 50 })
}

describe('webhook signature', () => {
  const p = provider(vi.fn())
  const h = (v?: string) => new Headers(v === undefined ? {} : { 'verif-hash': v })

  it('accepts only the exact secret hash', () => {
    expect(p.verifyWebhookSignature(h('hash-123'), '')).toBe(true)
    expect(p.verifyWebhookSignature(h('hash-124'), '')).toBe(false)
    expect(p.verifyWebhookSignature(h('hash-12'), '')).toBe(false)
    expect(p.verifyWebhookSignature(h(''), '')).toBe(false)
    expect(p.verifyWebhookSignature(h(), '')).toBe(false)
  })

  it('rejects everything when no secret hash is configured', () => {
    const unconfigured = createFlutterwaveProvider({ secretKey: 'x', webhookSecretHash: '', fetchImpl: vi.fn() })
    expect(unconfigured.verifyWebhookSignature(h(''), '')).toBe(false)
  })

  it('compares in constant time regardless of length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('initiate', () => {
  it('sends the reference, exact amount and redirect, server-side with the secret key', async () => {
    const fetchImpl = vi.fn(async () => json(200, { status: 'success', data: { link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc' } }))
    const res = await provider(fetchImpl as typeof fetch).initiate({
      reference: 'FHP-AAAA1111BBBB', amountMinor: 2499990, currency: 'NGN',
      customer: { email: 'c@x.co' }, redirectUrl: 'https://shop.test/checkout/complete?ref=FHP-AAAA1111BBBB', description: 'Order FH-1',
    })
    expect(res.checkoutUrl).toMatch(/^https:\/\/checkout\.flutterwave\.com/)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.flutterwave.com/v3/payments')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer FLWSECK_TEST-x')
    expect(JSON.parse(init.body as string)).toMatchObject({ tx_ref: 'FHP-AAAA1111BBBB', amount: 24999.9, currency: 'NGN' })
  })

  it('a timeout is retryable and is attempted exactly once (no automatic duplicate checkout)', async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })))
    }))
    const err = await provider(fetchImpl as unknown as typeof fetch).initiate({
      reference: 'FHP-AAAA1111BBBB', amountMinor: 100, currency: 'NGN', customer: { email: 'c@x.co' }, redirectUrl: 'https://x', description: 'x',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err.retryable).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('a rejected request is not retryable', async () => {
    const err = await provider(vi.fn(async () => json(400, { status: 'error', message: 'Invalid currency' })) as typeof fetch)
      .initiate({ reference: 'FHP-AAAA1111BBBB', amountMinor: 100, currency: 'NGN', customer: { email: 'c@x.co' }, redirectUrl: 'https://x', description: 'x' })
      .catch((e) => e)
    expect(err.retryable).toBe(false)
  })
})

describe('verify', () => {
  const tx = (overrides: Record<string, unknown> = {}) => ({
    status: 'success',
    data: { id: 285959875, tx_ref: 'FHP-AAAA1111BBBB', amount: 24999.9, currency: 'NGN', status: 'successful', ...overrides },
  })

  it('maps a verified transaction to minor units', async () => {
    const v = await provider(vi.fn(async () => json(200, tx())) as typeof fetch).verifyByTransactionId('285959875')
    expect(v).toEqual({ providerTransactionId: '285959875', reference: 'FHP-AAAA1111BBBB', status: 'successful', amountMinor: 2499990, currency: 'NGN', failureReason: null })
  })

  it('treats unknown statuses as pending, never as paid', async () => {
    const v = await provider(vi.fn(async () => json(200, tx({ status: 'pending' }))) as typeof fetch).verifyByTransactionId('1')
    expect(v.status).toBe('pending')
  })

  it('an unparseable amount becomes null (rejected later), not a guess', async () => {
    const v = await provider(vi.fn(async () => json(200, tx({ amount: 'lots' }))) as typeof fetch).verifyByTransactionId('1')
    expect(v.amountMinor).toBeNull()
  })

  it('returns null when Flutterwave has no transaction for a reference', async () => {
    const v = await provider(vi.fn(async () => json(400, { status: 'error', message: 'No transaction was found' })) as typeof fetch)
      .verifyByReference('FHP-NEVERPAID0000')
    expect(v).toBeNull()
  })

  it('refuses a non-numeric transaction id before calling Flutterwave', async () => {
    const fetchImpl = vi.fn()
    await expect(provider(fetchImpl as unknown as typeof fetch).verifyByTransactionId('1/../../payments')).rejects.toThrow(/Invalid/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('parseWebhook', () => {
  it('builds a stable dedupe key from event, transaction id and status', () => {
    const p = provider(vi.fn())
    const body = { event: 'charge.completed', data: { id: 1, tx_ref: 'FHP-AAAA1111BBBB', status: 'successful' } }
    expect(p.parseWebhook(body)?.dedupeKey).toBe('charge.completed:1:successful')
    expect(p.parseWebhook({ ...body, data: { ...body.data, status: 'failed' } })?.dedupeKey).toBe('charge.completed:1:failed')
    expect(p.parseWebhook({ nope: true })).toBeNull()
  })
})
