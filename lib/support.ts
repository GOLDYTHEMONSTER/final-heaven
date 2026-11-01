// Support: the reference a customer quotes, when we say they'll hear back, and
// the built-in saved replies. Pure, so the form, the emails and Studio share
// them and they can be unit-tested. Wording that carries a number reads it
// from lib/legal or lib/delivery, so a policy change can't leave a reply stale.
import { POLICY } from '@/lib/legal'
import { DELIVERY } from '@/lib/delivery'

/** What the acknowledgement promises. No support time was stated anywhere else in the store. */
export const SUPPORT_REPLY_TIME = 'within 1–2 working days'

// No 0/O, 1/I or L: a reference is read aloud and typed from an email.
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const REFERENCE_PATTERN = /^FH-[A-Z0-9]{4}$/

/** A short reference such as FH-7K2Q. The database keeps it unique per store; the caller retries on a clash. */
export function newSupportReference(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(4)
  // 256 is not a multiple of 31, but 4 characters from 31 only need to be hard to guess, not perfectly even.
  return `FH-${Array.from(bytes, (b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('')}`
}

/** "Re: About an order [FH-7K2Q]"; the reference is left out for messages that pre-date references. */
export function replySubject(topic: string, reference: string | null) {
  return `Re: ${topic}${reference ? ` [${reference}]` : ''}`.replace(/[\r\n]+/g, ' ').trim()
}

export type SavedReply = { id: string | null; key: string | null; title: string; body: string }

/**
 * Placeholders in a saved reply, filled when staff pick it:
 * {name} the customer's first name, {order} their order number (or "your order"),
 * {track} the order tracking page, with the order number filled in when we have it.
 */
export function fillReply(body: string, { name, orderNumber, site }: { name: string; orderNumber: string | null; site: string }) {
  const track = `${site.replace(/\/$/, '')}/track-order${orderNumber ? `?orderNumber=${encodeURIComponent(orderNumber)}` : ''}`
  return body
    .replaceAll('{name}', name.trim().split(/\s+/)[0] || 'there')
    .replaceAll('{order}', orderNumber ?? 'your order')
    .replaceAll('{track}', track)
}

const days = (w: { min: number; max: number }) => `${w.min}–${w.max} days`

/** The built-ins. Staff edit a copy (support_saved_replies, by key); deleting the copy brings the built-in back. */
export function defaultSavedReplies(site: string): SavedReply[] {
  const s = site.replace(/\/$/, '')
  const reply = (key: string, title: string, lines: string[]): SavedReply => ({ id: null, key, title, body: lines.join('\n\n') })
  return [
    reply('where_is_my_order', 'Where’s my order', [
      'Hi {name},',
      'Thanks for getting in touch. You can see where {order} is at any time on our tracking page: {track}',
      'Enter your order number and the email address you ordered with. If it doesn’t match what you expect, reply here and we’ll look into it.',
    ]),
    reply('sizing', 'Sizing', [
      'Hi {name},',
      'Thanks for asking. The sizes we have are listed on each product page, so choose from those. If you’re between two sizes, tell us the size you usually wear and your height, and we’ll tell you which to pick.',
    ]),
    reply('delivery_time', 'Delivery time', [
      'Hi {name},',
      `Thanks for asking. Items we hold in stock arrive ${days(DELIVERY.inStock)} after your payment is verified. Items we order in from China take ${days(DELIVERY.fromChina)} with standard delivery, or ${days(DELIVERY.expressFromChina)} with Express by air when it’s offered. Made-to-order and pre-order items show their own dates on the product page. Full details: ${s}/shipping`,
    ]),
    reply('returns', 'Returns', [
      'Hi {name},',
      `Thanks for getting in touch. You can return an item within ${POLICY.returnWindowDays} days of delivery. Once your return arrives and we’ve checked it, we issue the refund within ${POLICY.refundProcessingDays} business days. Full policy: ${s}/returns`,
      'To start, reply with your order number and which item you’re returning.',
    ]),
    reply('payment_failed', 'Payment failed', [
      'Hi {name},',
      'Sorry about the trouble with your payment. If you were told it failed, no order was placed and you can try again from your cart. If money left your account but you didn’t get an order confirmation, reply with the date, the amount and the email address you used, and we’ll check it and put it right.',
    ]),
  ]
}

/** Built-ins with the store's own edits applied (matched by key), then the replies staff added. */
export function mergeSavedReplies(defaults: SavedReply[], stored: SavedReply[]): SavedReply[] {
  const byKey = new Map(stored.filter((r) => r.key).map((r) => [r.key, r]))
  return [...defaults.map((d) => byKey.get(d.key) ?? d), ...stored.filter((r) => !r.key)]
}
