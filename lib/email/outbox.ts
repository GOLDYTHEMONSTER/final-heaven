// Delivers emails queued by the database (public.email_outbox). Independent of
// HTTP and the database client so it can be tested with fakes. Rules:
//  - Content and recipients are read at send time from the current record.
//  - Each row's dedupe key is sent as Resend's Idempotency-Key, so a retry
//    after an unclear failure can't deliver twice.
//  - Never throws: callers run it after their real work is done.
import { EmailError, type EmailSender, type OutgoingEmail } from './resend'
import { AUDIENCES, isAudience } from './campaign'
import { inviteLink } from '@/lib/early-access'
import { orderFollowupEmail, productAvailableEmail, welcomeEmail, type AlertProduct } from './lifecycle'
import { supportAckEmail, supportReplyEmail } from './support'
import { ticketsEmail, type TicketEmailData } from './tickets'
import {
  orderDeliveredEmail, orderPaidEmail, orderRefundedEmail, orderShippedEmail, staffMessageEmail, staffOrderPaidEmail,
  type MessageEmailData, type OrderEmailData, type RenderedEmail,
} from './templates'

export type OutboxKind = 'order.paid' | 'order.shipped' | 'staff.order_paid' | 'staff.message' | 'subscriber.welcome' | 'product.available' | 'order.followup' | 'order.delivered' | 'order.refunded' | 'support.ack' | 'support.reply' | 'tickets.issued'

export type OutboxRow = {
  id: number
  tenantId: string
  kind: OutboxKind
  orderId: string | null
  messageId: string | null
  subscriberId: string | null
  alertId: string | null
  replyId?: string | null
  ticketOrderId?: string | null
  dedupeKey: string
  attempts: number
}

/** `early`: their personal early access code and its percent now (lib/early-access), when they have one. */
export type SubscriberEmailData = { email: string; source: string | null; unsubscribeToken: string; unsubscribed: boolean; early?: { code: string; percent: number } | null }
/** A staff reply with the customer's message it answers. */
export type ReplyEmailData = { body: string; message: MessageEmailData }
/** An alert with its product as it is now; buyable is purchaseState at the time of sending. */
export type AlertEmailData = { email: string; unsubscribeToken: string; product: AlertProduct | null; buyable: boolean }

export type FinishResult =
  | { status: 'sent'; providerMessageId: string }
  | { status: 'failed' | 'skipped'; error: string; final?: boolean }

export interface EmailStore {
  claim(limit: number, maxAttempts: number): Promise<OutboxRow[]>
  loadOrder(id: string): Promise<OrderEmailData | null>
  loadMessage(id: string): Promise<MessageEmailData | null>
  loadReply(id: string): Promise<ReplyEmailData | null>
  loadSubscriber(id: string): Promise<SubscriberEmailData | null>
  loadAlert(id: string): Promise<AlertEmailData | null>
  /** A ticket order with its event and tickets (lib/events). */
  loadTicketOrder?(id: string): Promise<TicketEmailData | null>
  /** Whether this address is on the suppression list (hard bounce or spam complaint). */
  suppressed(tenantId: string, email: string): Promise<boolean>
  finish(id: number, result: FinishResult, maxAttempts: number): Promise<void>
}

export type EmailConfig = {
  from: string
  replyTo: string | null
  /** Where staff alerts go; none set means staff alerts are skipped. */
  staffTo: string[]
  siteUrl: string
}

export type EmailDeps = {
  store: EmailStore
  sender: EmailSender | null
  config: EmailConfig | null
  log: (event: string, fields: Record<string, unknown>) => void
  /** Pause between sends, to stay under Resend's 2 requests/second. */
  pauseMs?: number
}

export const MAX_EMAIL_ATTEMPTS = 5

export type DeliverySummary = { configured: boolean; sent: number; failed: number; skipped: number }

async function compose(deps: EmailDeps, row: OutboxRow): Promise<OutgoingEmail | { skip: string }> {
  const { store, config } = deps
  const site = config!.siteUrl.replace(/\/$/, '')
  const base = (to: string[], r: RenderedEmail, replyTo: string | null): OutgoingEmail => ({
    from: config!.from, to, replyTo, ...r, tags: [{ name: 'kind', value: row.kind.replace('.', '_') }],
  })

  if (row.kind === 'staff.message') {
    if (!config!.staffTo.length) return { skip: 'no staff alert address configured' }
    const m = row.messageId ? await store.loadMessage(row.messageId) : null
    if (!m) return { skip: 'message no longer exists' }
    return base(config!.staffTo, staffMessageEmail(m, site), m.email) // reply goes straight to the customer
  }

  if (row.kind === 'support.ack') {
    const m = row.messageId ? await store.loadMessage(row.messageId) : null
    if (!m) return { skip: 'message no longer exists' }
    return base([m.email], supportAckEmail(m, site), config!.replyTo)
  }

  if (row.kind === 'support.reply') {
    const r = row.replyId ? await store.loadReply(row.replyId) : null
    if (!r) return { skip: 'reply no longer exists' }
    return base([r.message.email], supportReplyEmail(r.message, r.body, site), config!.replyTo)
  }

  if (row.kind === 'subscriber.welcome') {
    const s = row.subscriberId ? await store.loadSubscriber(row.subscriberId) : null
    if (!s) return { skip: 'subscriber no longer exists' }
    if (s.unsubscribed) return { skip: 'unsubscribed before the welcome was sent' }
    const reason = isAudience(s.source) ? AUDIENCES[s.source].reason : 'you signed up for Final Heaven emails'
    return {
      ...base([s.email], welcomeEmail({
        source: s.source, site, unsubscribeUrl: `${site}/unsubscribe?token=${s.unsubscribeToken}`, reason,
        early: s.early ? { ...s.early, inviteLink: inviteLink(site, s.early.code) } : null,
      }), config!.replyTo),
      headers: {
        'List-Unsubscribe': `<${site}/api/newsletter/unsubscribe?token=${s.unsubscribeToken}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  }

  if (row.kind === 'product.available') {
    const a = row.alertId ? await store.loadAlert(row.alertId) : null
    if (!a) return { skip: 'alert no longer exists (cancelled)' }
    if (!a.product) return { skip: 'product no longer exists' }
    if (!a.buyable) return { skip: 'product sold out or closed again before the alert was sent' }
    return {
      ...base([a.email], productAvailableEmail({ product: a.product, site, unsubscribeUrl: `${site}/unsubscribe?token=${a.unsubscribeToken}` }), config!.replyTo),
      headers: {
        'List-Unsubscribe': `<${site}/api/newsletter/unsubscribe?token=${a.unsubscribeToken}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  }

  if (row.kind === 'tickets.issued') {
    const t = row.ticketOrderId && store.loadTicketOrder ? await store.loadTicketOrder(row.ticketOrderId) : null
    if (!t) return { skip: 'ticket order no longer exists' }
    if (t.status === 'cancelled') return { skip: 'ticket order was cancelled' }
    return base([t.email], ticketsEmail(t, site), config!.replyTo)
  }

  const o = row.orderId ? await store.loadOrder(row.orderId) : null
  if (!o) return { skip: 'order no longer exists' }
  switch (row.kind) {
    case 'order.paid':
      return base([o.email], orderPaidEmail(o, site), config!.replyTo)
    case 'order.shipped':
      if (o.status === 'cancelled') return { skip: 'order was cancelled' }
      return base([o.email], orderShippedEmail(o, site), config!.replyTo)
    case 'order.delivered':
      if (o.status !== 'delivered') return { skip: `order is ${o.status}, not delivered` }
      return base([o.email], orderDeliveredEmail(o, site), config!.replyTo)
    case 'order.refunded':
      if (o.paymentStatus !== 'refunded' && o.paymentStatus !== 'partially_refunded') return { skip: 'order is no longer refunded' }
      return base([o.email], orderRefundedEmail(o, site), config!.replyTo)
    case 'order.followup':
      // Only while it's still a delivered order: not if it was since returned, cancelled or refunded.
      if (o.status !== 'delivered') return { skip: `order is ${o.status}, not delivered` }
      return base([o.email], orderFollowupEmail(o, site), config!.replyTo)
    case 'staff.order_paid':
      if (!config!.staffTo.length) return { skip: 'no staff alert address configured' }
      return base(config!.staffTo, staffOrderPaidEmail(o, site), o.email)
  }
}

/** Sends up to `limit` queued emails. Safe to run concurrently and repeatedly. */
export async function deliverQueuedEmails(deps: EmailDeps, { limit = 5 } = {}): Promise<DeliverySummary> {
  const summary: DeliverySummary = { configured: Boolean(deps.sender && deps.config), sent: 0, failed: 0, skipped: 0 }
  if (!deps.sender || !deps.config) return summary // rows stay queued until email is configured
  const { store, sender, log } = deps
  const pauseMs = deps.pauseMs ?? 550

  let rows: OutboxRow[]
  try {
    rows = await store.claim(limit, MAX_EMAIL_ATTEMPTS)
  } catch (e) {
    log('email.claim_failed', { error: (e as Error).message })
    return summary
  }

  for (const [i, row] of rows.entries()) {
    if (i > 0 && pauseMs) await new Promise((r) => setTimeout(r, pauseMs))
    try {
      const email = await compose(deps, row)
      if ('skip' in email) {
        await store.finish(row.id, { status: 'skipped', error: email.skip }, MAX_EMAIL_ATTEMPTS)
        summary.skipped += 1
        continue
      }
      // Staff alerts go to the owner's own address; everything else goes to a customer.
      if (!row.kind.startsWith('staff.') && await store.suppressed(row.tenantId, email.to[0])) {
        await store.finish(row.id, { status: 'skipped', error: 'address is suppressed (bounced or complained)' }, MAX_EMAIL_ATTEMPTS)
        summary.skipped += 1
        continue
      }
      const { id } = await sender.send(email, row.dedupeKey)
      await store.finish(row.id, { status: 'sent', providerMessageId: id }, MAX_EMAIL_ATTEMPTS)
      summary.sent += 1
      log('email.sent', { kind: row.kind, outboxId: row.id })
    } catch (e) {
      const final = e instanceof EmailError && !e.retryable
      summary.failed += 1
      log('email.send_failed', { kind: row.kind, outboxId: row.id, attempt: row.attempts, final, error: (e as Error).message })
      try {
        await store.finish(row.id, { status: 'failed', error: (e as Error).message, final }, MAX_EMAIL_ATTEMPTS)
      } catch (finishError) {
        // The claim lock expires and a later run retries the row.
        log('email.finish_failed', { outboxId: row.id, error: (finishError as Error).message })
      }
    }
  }
  return summary
}
