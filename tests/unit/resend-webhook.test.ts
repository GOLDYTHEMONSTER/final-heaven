// Svix signature check and event reading for Resend's webhooks. No network.
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseResendEvent, TOLERANCE_SECONDS, verifySvix } from '@/lib/email/webhook'

const KEY = Buffer.from('a-test-signing-key-of-some-length')
const SECRET = `whsec_${KEY.toString('base64')}`
const NOW = 1_800_000_000
const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'em_1', to: ['a@b.test'] } })
const sign = (id: string, ts: number, text: string, key = KEY) => `v1,${createHmac('sha256', key).update(`${id}.${ts}.${text}`).digest('base64')}`
const check = (over: Partial<{ id: string | null; timestamp: string | null; signature: string | null; body: string; secret: string; now: number }> = {}) =>
  verifySvix({
    headers: { id: 'msg_1', timestamp: String(NOW), signature: sign('msg_1', NOW, body), ...over },
    body: over.body ?? body, secret: over.secret ?? SECRET, nowSeconds: over.now ?? NOW,
  })

describe('Svix signature', () => {
  it('accepts a correctly signed body', () => expect(check()).toBe(true))

  it('accepts when any of several space-separated signatures matches (secret rotation)', () => {
    expect(check({ signature: `v1,${Buffer.from('nope').toString('base64')} ${sign('msg_1', NOW, body)}` })).toBe(true)
  })

  it('rejects a changed body, id, key or missing headers', () => {
    expect(check({ body: body + ' ' })).toBe(false)
    expect(check({ id: 'msg_2' })).toBe(false)
    expect(check({ signature: sign('msg_1', NOW, body, Buffer.from('another key')) })).toBe(false)
    expect(check({ signature: null })).toBe(false)
    expect(check({ id: null })).toBe(false)
    expect(check({ timestamp: null })).toBe(false)
    expect(check({ signature: 'v2,abc' })).toBe(false)
    expect(check({ signature: 'v1,' })).toBe(false)
  })

  it('rejects timestamps more than 5 minutes either way, accepts right at the edge', () => {
    const at = (ts: number) => check({ timestamp: String(ts), signature: sign('msg_1', ts, body) })
    expect(at(NOW - TOLERANCE_SECONDS)).toBe(true)
    expect(at(NOW - TOLERANCE_SECONDS - 1)).toBe(false)
    expect(at(NOW + TOLERANCE_SECONDS + 1)).toBe(false)
    expect(check({ timestamp: 'abc' })).toBe(false)
  })

  it('rejects a secret that is not a whsec_ secret', () => {
    expect(check({ secret: KEY.toString('base64') })).toBe(false)
    expect(check({ secret: 'whsec_' })).toBe(false)
  })
})

describe('reading Resend events', () => {
  const event = (type: string, data: Record<string, unknown>) => parseResendEvent({ type, created_at: '2026-10-29T10:00:00.000Z', data: { email_id: 'em_9', to: ['Ada@X.test'], subject: 'secret', ...data } })

  it('suppresses on a permanent bounce and on a complaint, lower-casing the address', () => {
    expect(event('email.bounced', { bounce: { type: 'Permanent', subType: 'General' } })?.suppress).toEqual({ emails: ['ada@x.test'], reason: 'bounced' })
    expect(event('email.complained', {})?.suppress).toEqual({ emails: ['ada@x.test'], reason: 'complained' })
  })

  it('only records soft bounces and ordinary events', () => {
    expect(event('email.bounced', { bounce: { type: 'Transient' } })?.suppress).toBeNull()
    expect(event('email.bounced', {})?.suppress).toBeNull()
    expect(event('email.delivered', {})).toMatchObject({ type: 'email.delivered', messageId: 'em_9', suppress: null })
  })

  it('keeps the payload trimmed: no subject, and the click link only for clicks', () => {
    const e = event('email.clicked', { click: { link: 'https://finalheaven.shop/shop', ipAddress: '1.2.3.4' } })!
    expect(e.payload).toEqual({ to: ['ada@x.test'], click: { link: 'https://finalheaven.shop/shop' } })
    expect(JSON.stringify(e.payload)).not.toContain('secret')
  })

  it('ignores event types it does not keep and junk bodies', () => {
    expect(event('email.sent', {})).toBeNull()
    expect(parseResendEvent(null)).toBeNull()
    expect(parseResendEvent({ type: 5 })).toBeNull()
  })
})
