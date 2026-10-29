// The unfinished-checkout reminder. When a checkout begins, one email is
// scheduled with Resend for two hours later (there is no hourly job on this
// plan); when the checkout is paid or cancelled the scheduled email is
// cancelled. Pure orchestration over a store seam, so it's tested with fakes;
// the Supabase side is ./reminders-store.ts.
//
// The email is fixed when it's scheduled, so if the cancel ever fails (Resend
// down, or it had just gone out) the email itself says to ignore it if they
// have already paid. Limits, all checked before anything is scheduled:
//   - one reminder per checkout;
//   - one per email address per 24 hours;
//   - REMINDER_DAILY_CAP a day store-wide (Resend's free plan sends 100);
//   - never to a suppressed address, never while checkout is closed.
import type { EmailSender } from './resend'
import type { EmailConfig } from './outbox'
import { checkoutReminderEmail, type ReminderItem } from './lifecycle'

export const REMINDER_DELAY_MS = 2 * 3_600_000
export const REMINDER_DAILY_CAP = 30

export type ReminderCheckout = { id: string; tenantId: string; email: string; items: ReminderItem[]; currency: string; total: string }
export type ClaimResult = 'ok' | 'missing' | 'closed' | 'duplicate' | 'recent' | 'capped'

export interface ReminderStore {
  checkout(id: string): Promise<ReminderCheckout | null>
  suppressed(tenantId: string, email: string): Promise<boolean>
  /** Takes this checkout's one place under the per-address and daily limits. */
  claim(id: string, dailyCap: number): Promise<ClaimResult>
  saved(id: string, emailId: string): Promise<void>
  /** Gives the place back (the email couldn't be scheduled). */
  release(id: string): Promise<void>
  scheduled(id: string): Promise<{ emailId: string | null; cancelledAt: string | null } | null>
  markCancelled(id: string): Promise<void>
}

export type ReminderDeps = {
  store: ReminderStore
  sender: EmailSender | null
  config: EmailConfig | null
  now?: () => Date
  log: (event: string, fields: Record<string, unknown>) => void
}

export type ScheduleResult = ClaimResult | 'not_configured' | 'checkout_closed' | 'suppressed' | 'failed' | 'scheduled'

export async function scheduleCheckoutReminder(deps: ReminderDeps, checkoutId: string, { paymentsOpen }: { paymentsOpen: boolean }): Promise<ScheduleResult> {
  const { store, sender, config, log } = deps
  if (!sender || !config) return 'not_configured'
  if (!paymentsOpen) return 'checkout_closed' // a link back to a closed checkout would only disappoint
  const c = await store.checkout(checkoutId)
  if (!c) return 'missing'
  if (await store.suppressed(c.tenantId, c.email)) return 'suppressed'

  const claim = await store.claim(c.id, REMINDER_DAILY_CAP)
  if (claim !== 'ok') return claim

  const site = config.siteUrl.replace(/\/$/, '')
  const rendered = checkoutReminderEmail({ items: c.items, currency: c.currency, total: c.total, site })
  const at = new Date((deps.now?.() ?? new Date()).getTime() + REMINDER_DELAY_MS)
  try {
    const { id } = await sender.send({
      from: config.from, to: [c.email], replyTo: config.replyTo, ...rendered,
      tags: [{ name: 'kind', value: 'checkout_reminder' }], scheduledAt: at.toISOString(),
    }, `checkout-reminder:${c.id}`)
    await store.saved(c.id, id)
    return 'scheduled'
  } catch (e) {
    log('reminder.schedule_failed', { checkoutId: c.id, error: (e as Error).message })
    try { await store.release(c.id) } catch { /* the place stays taken: no reminder for this checkout, which is safe */ }
    return 'failed'
  }
}

export type CancelResult = 'none' | 'already_cancelled' | 'cancelled' | 'failed'

/** Cancels the scheduled reminder, if there is one. Never throws: the email's own wording covers a failure. */
export async function cancelCheckoutReminder(deps: ReminderDeps, checkoutId: string): Promise<CancelResult> {
  const { store, sender, log } = deps
  try {
    const s = await store.scheduled(checkoutId)
    if (!s?.emailId) return 'none'
    if (s.cancelledAt) return 'already_cancelled'
    if (!sender?.cancel) return 'failed'
    await sender.cancel(s.emailId)
    await store.markCancelled(checkoutId)
    return 'cancelled'
  } catch (e) {
    log('reminder.cancel_failed', { checkoutId, error: (e as Error).message })
    return 'failed'
  }
}
