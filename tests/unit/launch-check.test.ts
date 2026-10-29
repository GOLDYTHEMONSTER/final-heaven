import { describe, expect, it } from 'vitest'
import { computeLaunchChecklist, type LaunchSignals } from '@/lib/launch-check'

const good: LaunchSignals = {
  paymentsOpenOn: '2026-11-10', purchasesPaused: false, activeOwners: 1, mfaLockApplied: true, activeProducts: 25, activeWithoutPhoto: 0,
}
const env = {
  FLW_SECRET_KEY: 'FLWSECK-live-abc', FLW_SECRET_HASH: 'h', RESEND_API_KEY: 're_x', EMAIL_FROM: 'Final Heaven <orders@finalheaven.shop>',
  RESEND_WEBHOOK_SECRET: 'w', STAFF_ALERT_EMAIL: 'a@b.c', CRON_SECRET: 'c', SITE_URL: 'https://www.finalheaven.shop',
}
const legal = { legalName: 'FH Ltd', registrationNumber: 'BN1', address: '1 Road', email: 'a@b.c', phone: '080', privacyContact: 'Owner' }
const run = (o: { env?: Record<string, string | undefined>; signals?: Partial<LaunchSignals>; legal?: Record<string, string | null>; today?: string } = {}) =>
  computeLaunchChecklist({ env: o.env ?? env, signals: { ...good, ...o.signals }, legal: o.legal ?? legal, today: o.today ?? '2026-10-29' })
const level = (items: ReturnType<typeof run>, id: string) => items.find((i) => i.id === id)!.level

describe('launch checklist', () => {
  it('is all green when everything is in place', () => {
    expect(run().filter((i) => i.level !== 'green')).toEqual([])
  })

  it('never contains a secret value', () => {
    expect(JSON.stringify(run({ env: { ...env, FLW_SECRET_KEY: 'FLWSECK_TEST-supersecret' } }))).not.toMatch(/supersecret|FLWSECK|re_x/)
  })

  it('launch day: missing, passed while closed, passed while open', () => {
    expect(level(run({ signals: { paymentsOpenOn: null } }), 'launch-day')).toBe('red')
    expect(level(run({ signals: { paymentsOpenOn: '2026-10-01', purchasesPaused: true } }), 'launch-day')).toBe('red')
    expect(level(run({ signals: { paymentsOpenOn: '2026-10-01' } }), 'launch-day')).toBe('green')
    expect(level(run({ signals: { purchasesPaused: true } }), 'purchases')).toBe('red')
  })

  it('flags a test or missing Flutterwave key and a missing hash', () => {
    expect(level(run({ env: { ...env, FLW_SECRET_KEY: 'FLWSECK_TEST-1' } }), 'flw-key')).toBe('red')
    expect(level(run({ env: { ...env, FLW_SECRET_KEY: undefined } }), 'flw-key')).toBe('red')
    expect(level(run({ env: { ...env, FLW_SECRET_HASH: ' ' } }), 'flw-hash')).toBe('red')
  })

  it('checks Resend, its webhook, alerts, cron and the site address', () => {
    expect(level(run({ env: { ...env, RESEND_API_KEY: undefined } }), 'resend')).toBe('red')
    expect(level(run({ env: { ...env, EMAIL_FROM: 'x@gmail.com' } }), 'resend')).toBe('amber')
    expect(level(run({ env: { ...env, RESEND_WEBHOOK_SECRET: undefined } }), 'resend-webhook')).toBe('red')
    expect(level(run({ env: { ...env, STAFF_ALERT_EMAIL: undefined } }), 'staff-alert')).toBe('red')
    expect(level(run({ env: { ...env, CRON_SECRET: undefined } }), 'cron')).toBe('red')
    expect(level(run({ env: { ...env, SITE_URL: 'https://final-heaven.vercel.app' } }), 'site-url')).toBe('red')
    expect(level(run({ env: { ...env, SITE_URL: 'https://www.finalheaven.shop/' } }), 'site-url')).toBe('green')
  })

  it('database signals: owner, MFA lock text, products, photos', () => {
    expect(level(run({ signals: { activeOwners: 0 } }), 'owner')).toBe('red')
    const mfa = run({ signals: { mfaLockApplied: false } }).find((i) => i.id === 'mfa')!
    expect(mfa.level).toBe('amber')
    expect(mfa.fix).toBe('apply 20261028140000_staff_mfa.sql after the owner sets up two-step sign-in')
    expect(level(run({ signals: { activeProducts: 19 } }), 'products')).toBe('amber')
    expect(level(run({ signals: { activeWithoutPhoto: 2 } }), 'photos')).toBe('red')
  })

  it('names the missing legal details', () => {
    const item = run({ legal: { ...legal, address: null, phone: null } }).find((i) => i.id === 'legal')!
    expect(item.level).toBe('amber')
    expect(item.detail).toMatch(/address/)
    expect(item.detail).toMatch(/phone/)
  })
})
