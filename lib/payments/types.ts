// Provider-neutral payment contracts. The commerce code depends only on these;
// Flutterwave is the first adapter (lib/payments/flutterwave.ts).

export type ProviderName = 'flutterwave'

export type VerifiedStatus = 'successful' | 'failed' | 'cancelled' | 'pending'

/** A transaction as reported by the provider's VERIFY API, the only source we trust. */
export type VerifiedTransaction = {
  providerTransactionId: string
  reference: string
  status: VerifiedStatus
  amountMinor: number | null
  currency: string | null
  failureReason: string | null
}

export type InitiateInput = {
  reference: string
  amountMinor: number
  currency: string
  customer: { email: string; name?: string | null }
  redirectUrl: string
  description: string
}

/** A webhook event after the signature check. Its body is NOT trusted for money. */
export type ProviderWebhookEvent = {
  type: string
  providerTransactionId: string | null
  reference: string | null
  status: string | null
  /** Idempotency key: the same logical event always produces the same key. */
  dedupeKey: string
}

export class ProviderError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message)
    this.name = 'ProviderError'
  }
}

export interface PaymentProvider {
  readonly name: ProviderName
  /** Creates a hosted checkout. Never retried automatically: a timeout leaves the attempt for the customer to retry. */
  initiate(input: InitiateInput): Promise<{ checkoutUrl: string }>
  verifyByTransactionId(providerTransactionId: string): Promise<VerifiedTransaction>
  /** null when the provider has no transaction for this reference (customer never paid). */
  verifyByReference(reference: string): Promise<VerifiedTransaction | null>
  verifyWebhookSignature(headers: Headers, rawBody: string): boolean
  parseWebhook(body: unknown): ProviderWebhookEvent | null
}
