// Resend's webhooks are signed with Svix. Pure, so the signature check and the
// reading of events can be unit-tested without a network or a database.
//   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
//   key            = the base64 part of the secret after "whsec_"
//   svix-signature = space-separated "v1,<base64 HMAC-SHA256>" (several while a secret rotates)
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Svix's own tolerance: older or newer than this is a replay (or a wrong clock). */
export const TOLERANCE_SECONDS = 5 * 60

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null }

export function verifySvix({ headers, body, secret, nowSeconds = Math.floor(Date.now() / 1000) }: {
  headers: SvixHeaders; body: string; secret: string; nowSeconds?: number
}): boolean {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature || !secret.startsWith('whsec_')) return false
  if (!/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  if (!key.length) return false
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()

  // Every v1 signature is compared (no early exit on the first match or mismatch), in constant time.
  let ok = false
  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    const got = Buffer.from(value, 'base64')
    if (got.length === expected.length && timingSafeEqual(got, expected)) ok = true
  }
  return ok
}

/** What the database stores for an event, and what (if anything) it suppresses. */
export type ParsedEvent = {
  type: string
  messageId: string | null
  at: string | null
  payload: Record<string, unknown>
  /** Addresses to suppress, and why; null for events that only get recorded. */
  suppress: { emails: string[]; reason: 'bounced' | 'complained' } | null
}

/** Events worth keeping. email.sent is skipped: we already know we sent it. */
const KEPT = new Set([
  'email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained', 'email.opened', 'email.clicked', 'email.failed',
])

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const asString = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : undefined)

/**
 * Reads a Resend webhook body. Returns null for events we don't keep.
 * A hard bounce is Resend's "Permanent" type; "Transient" (mailbox full,
 * server down) and "Undetermined" can succeed later, so they only get recorded.
 */
export function parseResendEvent(body: unknown): ParsedEvent | null {
  const event = asObject(body)
  const type = asString(event.type, 60)
  if (!type || !KEPT.has(type)) return null
  const data = asObject(event.data)
  const to = (Array.isArray(data.to) ? data.to : typeof data.to === 'string' ? [data.to] : [])
    .filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 10)
  const bounce = asObject(data.bounce)
  const click = asObject(data.click)

  // Trimmed on purpose: recipients and the reason, never the subject or the content.
  const payload: Record<string, unknown> = { to }
  if (type === 'email.bounced') payload.bounce = { type: asString(bounce.type, 40), subType: asString(bounce.subType, 40) }
  if (type === 'email.clicked') payload.click = { link: asString(click.link, 300) }

  const hard = type === 'email.bounced' && ['permanent', 'hard'].includes(String(bounce.type ?? '').toLowerCase())
  const suppress = to.length && (hard || type === 'email.complained')
    ? { emails: to, reason: hard ? ('bounced' as const) : ('complained' as const) }
    : null
  return { type, messageId: asString(data.email_id, 100) ?? null, at: asString(event.created_at, 40) ?? null, payload, suppress }
}
