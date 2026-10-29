import 'server-only'
import { logger } from '@/lib/log'
import { flutterwaveFromEnv } from './flutterwave'
import { supabasePaymentStore } from './store'
import { cancelReminder } from '@/lib/email/reminders-store'
import type { ApplyOutcome, Deps, PaymentStore } from './service'

/** Outcomes after which the checkout is paid, so its "you left something behind" reminder must not go out. */
const PAID_OUTCOMES = new Set<ApplyOutcome>(['applied', 'already_applied', 'applied_to_cancelled_order', 'duplicate_payment'])

/**
 * Every way a payment gets confirmed (redirect, webhook, reconciliation) goes
 * through applyVerified, so this is the one place to cancel the checkout's
 * scheduled reminder. Best effort: it never changes the payment's outcome.
 */
export function withReminderCancel(store: PaymentStore, cancel: (checkoutId: string) => Promise<unknown> = cancelReminder): PaymentStore {
  return {
    ...store,
    async applyVerified(tx) {
      const outcome = await store.applyVerified(tx)
      if (PAID_OUTCOMES.has(outcome)) {
        try {
          const payment = await store.getByReference(tx.reference)
          if (payment?.checkoutId) await cancel(payment.checkoutId)
        } catch (error) {
          logger.warn('reminder.cancel_after_payment_failed', { reference: tx.reference, error })
        }
      }
      return outcome
    },
  }
}

/** Production wiring: Supabase store, Flutterwave from env, structured logs. */
export function paymentDeps(): Deps {
  return {
    store: withReminderCancel(supabasePaymentStore()),
    provider: flutterwaveFromEnv(),
    log: (event, fields) => logger.info(event, fields),
  }
}

/** Absolute site origin for provider redirects; configured, not taken from the Host header. */
export function siteUrl(req: Request) {
  return process.env.SITE_URL || new URL(req.url).origin
}
