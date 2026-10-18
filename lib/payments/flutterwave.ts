// Flutterwave v3 adapter (Standard hosted checkout), per the official docs
// checked 18 Oct 2026:
//   create:  POST /v3/payments                                -> data.link
//   verify:  GET  /v3/transactions/{id}/verify
//            GET  /v3/transactions/verify_by_reference?tx_ref=
//   webhook: `verif-hash` header must equal the secret hash set in the
//            dashboard (plain value, compared in constant time). The body is
//            only a hint; the transaction is always re-verified via the API.
import { timingSafeEqual } from 'node:crypto'
import { fromMinor, toMinor } from '@/lib/money'
import {
  ProviderError,
  type InitiateInput,
  type PaymentProvider,
  type ProviderWebhookEvent,
  type VerifiedStatus,
  type VerifiedTransaction,
} from './types'

const BASE_URL = 'https://api.flutterwave.com/v3'
const TIMEOUT_MS = 15_000

export type FlutterwaveConfig = {
  secretKey: string
  webhookSecretHash: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** Constant-time comparison that does not leak length through early exit. */
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab) // spend comparable time before failing
    return false
  }
  return timingSafeEqual(ab, bb)
}

const STATUS: Record<string, VerifiedStatus> = {
  successful: 'successful',
  failed: 'failed',
  cancelled: 'cancelled',
}

export function createFlutterwaveProvider(config: FlutterwaveConfig): PaymentProvider {
  const doFetch = config.fetchImpl ?? fetch
  const timeoutMs = config.timeoutMs ?? TIMEOUT_MS

  async function call(path: string, init: RequestInit = {}) {
    let res: Response
    try {
      res = await doFetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      })
    } catch (e) {
      // Timeout or network failure: the outcome is unknown, so it is retryable.
      throw new ProviderError(`Flutterwave request failed: ${(e as Error).name}`, true)
    }
    const body = await res.json().catch(() => null)
    if (!res.ok || body?.status !== 'success') {
      const retryable = res.status >= 500 || res.status === 429
      throw new ProviderError(`Flutterwave ${res.status}: ${body?.message ?? 'unexpected response'}`, retryable, res.status)
    }
    return body
  }

  function toVerified(data: Record<string, unknown>): VerifiedTransaction {
    const currency = typeof data.currency === 'string' ? data.currency.toUpperCase() : null
    let amountMinor: number | null = null
    if (currency && (typeof data.amount === 'number' || typeof data.amount === 'string')) {
      try {
        amountMinor = toMinor(data.amount, currency)
      } catch {
        amountMinor = null // unparseable amount: treated as a mismatch, never as paid
      }
    }
    const raw = String(data.status ?? '').toLowerCase()
    return {
      providerTransactionId: String(data.id),
      reference: String(data.tx_ref ?? ''),
      status: STATUS[raw] ?? 'pending',
      amountMinor,
      currency,
      failureReason: STATUS[raw] && raw !== 'successful' ? String(data.processor_response ?? raw).slice(0, 300) : null,
    }
  }

  return {
    name: 'flutterwave',

    async initiate(input: InitiateInput) {
      const body = await call('/payments', {
        method: 'POST',
        body: JSON.stringify({
          tx_ref: input.reference,
          // Exact decimal string from integer minor units, sent as a JSON number per the docs.
          amount: Number(fromMinor(input.amountMinor, input.currency)),
          currency: input.currency,
          redirect_url: input.redirectUrl,
          customer: { email: input.customer.email, ...(input.customer.name ? { name: input.customer.name } : {}) },
          customizations: { title: 'Final Heaven', description: input.description },
          meta: { reference: input.reference },
        }),
      })
      const link = body?.data?.link
      if (typeof link !== 'string' || !link.startsWith('https://')) {
        throw new ProviderError('Flutterwave returned no checkout link', false)
      }
      return { checkoutUrl: link }
    },

    async verifyByTransactionId(id: string) {
      if (!/^\d{1,20}$/.test(id)) throw new ProviderError('Invalid Flutterwave transaction id', false, 400)
      const body = await call(`/transactions/${id}/verify`)
      return toVerified(body.data)
    },

    async verifyByReference(reference: string) {
      try {
        const body = await call(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`)
        return toVerified(body.data)
      } catch (e) {
        // Flutterwave answers 400/404 when no transaction exists for the reference yet.
        if (e instanceof ProviderError && (e.status === 400 || e.status === 404)) return null
        throw e
      }
    },

    verifyWebhookSignature(headers: Headers) {
      const got = headers.get('verif-hash')
      return !!config.webhookSecretHash && !!got && safeEqual(got, config.webhookSecretHash)
    },

    parseWebhook(body: unknown): ProviderWebhookEvent | null {
      if (!body || typeof body !== 'object') return null
      const b = body as { event?: unknown; data?: Record<string, unknown> }
      if (typeof b.event !== 'string' || !b.data || typeof b.data !== 'object') return null
      const id = b.data.id != null ? String(b.data.id) : null
      const status = b.data.status != null ? String(b.data.status) : null
      return {
        type: b.event,
        providerTransactionId: id,
        reference: typeof b.data.tx_ref === 'string' ? b.data.tx_ref : null,
        status,
        // Per Flutterwave's guidance: event type + transaction id + status.
        dedupeKey: `${b.event}:${id ?? 'none'}:${status ?? 'none'}`,
      }
    },
  }
}

/**
 * The configured Flutterwave adapter, or null when the keys are not set
 * (orders are still taken; staff can record offline payments).
 */
export function flutterwaveFromEnv(): PaymentProvider | null {
  const secretKey = process.env.FLW_SECRET_KEY
  const webhookSecretHash = process.env.FLW_SECRET_HASH
  if (!secretKey || !webhookSecretHash) return null
  return createFlutterwaveProvider({ secretKey, webhookSecretHash })
}
