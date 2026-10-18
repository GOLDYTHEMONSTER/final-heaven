// Payment workflows, independent of HTTP and of the database client so they
// can be tested with fakes. Rules:
//  - Only values from the provider's VERIFY API ever change money state.
//  - Webhook events are stored durably before processing; a processing
//    failure leaves the event for the reconciliation job, never loses it.
//  - Starting a payment is never retried automatically.
import { reference as newReference } from '@/lib/api'
import { ProviderError, type PaymentProvider, type VerifiedTransaction } from './types'

export type PaymentRecord = {
  id: string
  reference: string
  tenantId: string
  /** Set once the order exists: at once for legacy orders, on payment for checkouts. */
  orderId: string | null
  checkoutId: string | null
  orderNumber: string
  amountMinor: number
  currency: string
  status: 'initiated' | 'pending' | 'successful' | 'failed' | 'cancelled' | 'abandoned'
  checkoutUrl: string | null
  createdAt: string
}

export type ApplyOutcome =
  | 'applied' | 'already_applied' | 'applied_to_cancelled_order' | 'duplicate_payment' | 'rejected_amount'
  | 'rejected_currency' | 'failed_recorded' | 'pending' | 'unknown_reference'

export type StoredEvent = { id: string; duplicate: boolean }

export type BacklogEvent = {
  id: string
  eventType: string
  providerTransactionId: string | null
  reference: string | null
  attempts: number
}

/** Persistence the workflows need; implemented on Supabase in ./store.ts. */
export interface PaymentStore {
  findReusableAttempt(target: PaymentTarget, maxAgeMinutes: number): Promise<PaymentRecord | null>
  createAttempt(a: { target: PaymentTarget; reference: string; amountMinor: number; currency: string; provider: string }): Promise<void>
  setCheckoutUrl(reference: string, url: string): Promise<void>
  recordInitFailure(reference: string, reason: string): Promise<void>
  getByReference(reference: string): Promise<PaymentRecord | null>
  applyVerified(tx: VerifiedTransaction): Promise<ApplyOutcome>
  storeEvent(e: { provider: string; dedupeKey: string; eventType: string; providerTransactionId: string | null; reference: string | null; payload: unknown }): Promise<StoredEvent>
  finishEvent(id: string, r: { status: 'processed' | 'ignored' | 'failed'; error?: string; tenantId?: string; paymentId?: string }): Promise<void>
  eventBacklog(limit: number, maxAttempts: number): Promise<BacklogEvent[]>
  stalePayments(olderThanMinutes: number, limit: number): Promise<PaymentRecord[]>
  markAbandoned(reference: string): Promise<void>
}

/** What a payment pays for: a checkout (its order is placed when it succeeds) or an existing order. */
export type PaymentTarget = { kind: 'checkout' | 'order'; id: string; tenantId: string }

export type Deps = {
  store: PaymentStore
  provider: PaymentProvider | null
  log: (event: string, fields: Record<string, unknown>) => void
  now?: () => Date
}

export const REUSE_ATTEMPT_MINUTES = 30
export const ABANDON_AFTER_HOURS = 24
export const MAX_EVENT_ATTEMPTS = 5

// ---------------------------------------------------------------------------
// Starting a payment
// ---------------------------------------------------------------------------

export type StartResult =
  | { ok: true; checkoutUrl: string; reference: string; reused: boolean }
  | { ok: false; reason: 'not_configured' | 'provider_unavailable' | 'provider_rejected'; reference?: string }

export async function startPayment(
  deps: Deps,
  payFor: PaymentTarget & { amountMinor: number; currency: string; email: string; description: string },
  redirectBaseUrl: string
): Promise<StartResult> {
  const { store, provider, log } = deps
  if (!provider) return { ok: false, reason: 'not_configured' }
  const target: PaymentTarget = { kind: payFor.kind, id: payFor.id, tenantId: payFor.tenantId }

  // A recent link for the same checkout is reused, so a double-click or a retry
  // after a slow response doesn't create a second payment.
  const existing = await store.findReusableAttempt(target, REUSE_ATTEMPT_MINUTES)
  if (existing?.checkoutUrl) return { ok: true, checkoutUrl: existing.checkoutUrl, reference: existing.reference, reused: true }

  const reference = newReference('FHP', 12)
  await store.createAttempt({ target, reference, amountMinor: payFor.amountMinor, currency: payFor.currency, provider: provider.name })
  try {
    const redirectUrl = `${redirectBaseUrl.replace(/\/$/, '')}/checkout/complete?ref=${encodeURIComponent(reference)}`
    const { checkoutUrl } = await provider.initiate({
      reference, amountMinor: payFor.amountMinor, currency: payFor.currency,
      customer: { email: payFor.email }, redirectUrl, description: payFor.description,
    })
    await store.setCheckoutUrl(reference, checkoutUrl)
    return { ok: true, checkoutUrl, reference, reused: false }
  } catch (e) {
    // Not retried here. The attempt stays 'initiated' with the reason recorded;
    // reconciliation will pick it up if the customer did reach checkout.
    const retryable = e instanceof ProviderError && e.retryable
    await store.recordInitFailure(reference, (e as Error).message)
    log('payment.initiate_failed', { reference, target: target.kind, retryable, error: (e as Error).message })
    return { ok: false, reason: retryable ? 'provider_unavailable' : 'provider_rejected', reference }
  }
}

// ---------------------------------------------------------------------------
// Confirming after the customer returns from checkout
// ---------------------------------------------------------------------------

export type ConfirmResult =
  | { ok: true; outcome: ApplyOutcome | 'not_found_at_provider'; payment: PaymentRecord }
  | { ok: false; reason: 'unknown_reference' | 'not_configured' | 'provider_unavailable' | 'reference_mismatch' }

/**
 * The redirect's own status/transaction_id are hints only: the transaction is
 * fetched from the provider and must carry OUR reference, so a customer cannot
 * claim someone else's successful transaction for their order.
 */
export async function confirmPayment(deps: Deps, reference: string, providerTransactionId?: string | null): Promise<ConfirmResult> {
  const { store, provider, log } = deps
  const payment = await store.getByReference(reference)
  if (!payment) return { ok: false, reason: 'unknown_reference' }
  if (payment.status === 'successful') return { ok: true, outcome: 'already_applied', payment }
  if (!provider) return { ok: false, reason: 'not_configured' }

  let tx: VerifiedTransaction | null
  try {
    tx = providerTransactionId
      ? await provider.verifyByTransactionId(providerTransactionId)
      : await provider.verifyByReference(reference)
  } catch (e) {
    log('payment.verify_failed', { reference, error: (e as Error).message })
    return { ok: false, reason: 'provider_unavailable' }
  }
  if (!tx) return { ok: true, outcome: 'not_found_at_provider', payment }
  if (tx.reference !== reference) {
    log('payment.reference_mismatch', { reference, providerTransactionId: tx.providerTransactionId, got: tx.reference })
    return { ok: false, reason: 'reference_mismatch' }
  }
  const outcome = await store.applyVerified(tx)
  log('payment.confirmed', { reference, outcome, via: 'redirect' })
  return { ok: true, outcome, payment: (await store.getByReference(reference)) ?? payment }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookResult = { httpStatus: 200 | 400 | 401 | 500; body: Record<string, unknown> }

/**
 * Status codes follow Flutterwave's retry contract: 401 for a bad signature
 * (nothing stored), 500 only when the event could not be stored (so they
 * retry), otherwise 200, including when processing failed after storing,
 * because our reconciliation job owns the retry from then on.
 */
export async function handleWebhook(deps: Deps, headers: Headers, rawBody: string): Promise<WebhookResult> {
  const { store, provider, log } = deps
  if (!provider) return { httpStatus: 500, body: { error: 'payments not configured' } }
  if (!provider.verifyWebhookSignature(headers, rawBody)) {
    log('webhook.signature_rejected', { provider: provider.name })
    return { httpStatus: 401, body: { error: 'invalid signature' } }
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return { httpStatus: 400, body: { error: 'invalid json' } }
  }
  const event = provider.parseWebhook(body)
  if (!event) return { httpStatus: 400, body: { error: 'unrecognised event' } }

  let stored: StoredEvent
  try {
    stored = await store.storeEvent({
      provider: provider.name, dedupeKey: event.dedupeKey, eventType: event.type,
      providerTransactionId: event.providerTransactionId, reference: event.reference, payload: body,
    })
  } catch (e) {
    log('webhook.store_failed', { error: (e as Error).message, dedupeKey: event.dedupeKey })
    return { httpStatus: 500, body: { error: 'temporarily unavailable' } }
  }
  if (stored.duplicate) return { httpStatus: 200, body: { received: true, duplicate: true } }

  await processEvent(deps, {
    id: stored.id, eventType: event.type, providerTransactionId: event.providerTransactionId,
    reference: event.reference, attempts: 0,
  })
  return { httpStatus: 200, body: { received: true } }
}

/** Processes one stored event. Safe to run repeatedly for the same event. */
export async function processEvent(deps: Deps, ev: BacklogEvent): Promise<void> {
  const { store, provider, log } = deps
  if (!provider) return
  if (ev.eventType !== 'charge.completed') {
    await store.finishEvent(ev.id, { status: 'ignored', error: `unhandled event type ${ev.eventType}` })
    return
  }
  try {
    const tx = ev.providerTransactionId
      ? await provider.verifyByTransactionId(ev.providerTransactionId)
      : ev.reference ? await provider.verifyByReference(ev.reference) : null
    if (!tx) {
      await store.finishEvent(ev.id, { status: 'failed', error: 'transaction not found at provider' })
      return
    }
    const payment = await store.getByReference(tx.reference)
    if (!payment) {
      // Not one of our checkouts (e.g. a payment link made in the dashboard).
      await store.finishEvent(ev.id, { status: 'ignored', error: 'unknown reference' })
      return
    }
    const outcome = await store.applyVerified(tx)
    await store.finishEvent(ev.id, { status: 'processed', tenantId: payment.tenantId, paymentId: payment.id })
    log('payment.confirmed', { reference: tx.reference, outcome, via: 'webhook' })
  } catch (e) {
    await store.finishEvent(ev.id, { status: 'failed', error: (e as Error).message.slice(0, 500) })
    log('webhook.process_failed', { eventId: ev.id, attempt: ev.attempts + 1, error: (e as Error).message })
  }
}

// ---------------------------------------------------------------------------
// Reconciliation job
// ---------------------------------------------------------------------------

export type ReconcileSummary = {
  eventsRetried: number
  paymentsChecked: number
  outcomes: Record<string, number>
  abandoned: number
  errors: number
}

/**
 * Retries stored events that failed, and asks the provider about payments that
 * are still open, so a missed or failed webhook never loses a payment.
 */
export async function reconcile(deps: Deps, { staleMinutes = 10, limit = 50 } = {}): Promise<ReconcileSummary> {
  const { store, provider, log } = deps
  const now = deps.now?.() ?? new Date()
  const summary: ReconcileSummary = { eventsRetried: 0, paymentsChecked: 0, outcomes: {}, abandoned: 0, errors: 0 }
  if (!provider) return summary

  for (const ev of await store.eventBacklog(limit, MAX_EVENT_ATTEMPTS)) {
    await processEvent(deps, ev)
    summary.eventsRetried += 1
  }

  for (const p of await store.stalePayments(staleMinutes, limit)) {
    summary.paymentsChecked += 1
    try {
      const tx = await provider.verifyByReference(p.reference)
      if (tx && tx.reference === p.reference) {
        const outcome = await store.applyVerified(tx)
        summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1
      } else if (now.getTime() - new Date(p.createdAt).getTime() > ABANDON_AFTER_HOURS * 3_600_000) {
        await store.markAbandoned(p.reference)
        summary.abandoned += 1
      }
    } catch (e) {
      summary.errors += 1
      log('reconcile.payment_failed', { reference: p.reference, error: (e as Error).message })
    }
  }
  return summary
}
