// Launch checklist: pure logic (inputs in, items out). The route gathers the
// inputs; nothing here reads the environment or the database, and no secret
// value ever enters an item: only whether it is set or looks right.
import { paymentsState } from '@/lib/catalog'

export type Level = 'green' | 'amber' | 'red'
export type CheckItem = { id: string; level: Level; label: string; detail: string; fix: string | null }

export type LaunchSignals = {
  paymentsOpenOn: string | null
  purchasesPaused: boolean
  activeOwners: number
  mfaLockApplied: boolean
  activeProducts: number
  activeWithoutPhoto: number
}

export type LegalDetails = Record<string, string | null>
type Env = Record<string, string | undefined>

export const SITE = 'https://www.finalheaven.shop'
export const MIN_PRODUCTS = 20

const set = (v: string | undefined) => (v ?? '').trim().length > 0
const LEGAL_LABELS: Record<string, string> = {
  legalName: 'registered name', registrationNumber: 'registration number', address: 'address',
  email: 'support email', phone: 'phone', privacyContact: 'privacy contact',
}

export function computeLaunchChecklist(input: { env: Env; signals: LaunchSignals; legal: LegalDetails; today: string }): CheckItem[] {
  const { env, signals: s, legal, today } = input
  const items: CheckItem[] = []
  const add = (id: string, label: string, ok: boolean | Level, detail: string, fix: string | null) =>
    items.push({ id, label, level: typeof ok === 'string' ? ok : ok ? 'green' : 'red', detail: ok === true ? detail : detail, fix: ok === true || ok === 'green' ? null : fix })

  const pay = paymentsState({ paymentsOpenOn: s.paymentsOpenOn, purchasesPaused: s.purchasesPaused }, today)
  const day = s.paymentsOpenOn?.slice(0, 10) ?? null
  if (!day) add('launch-day', 'Launch day', 'red', 'No launch day is set.', 'Set the launch day in Checkout below.')
  else if (day < today && !pay.open) add('launch-day', 'Launch day', 'red', `The launch day (${day}) has passed but checkout is closed.`, 'Resume purchases below, or set a new launch day.')
  else add('launch-day', 'Launch day', 'green', pay.open ? `Checkout is open (since ${day}).` : `Checkout opens on ${day}.`, null)

  add('purchases', 'Purchases not paused', !s.purchasesPaused, s.purchasesPaused ? 'Purchases are paused.' : 'Purchases are not paused.',
    'Resume purchases below.')

  const key = env.FLW_SECRET_KEY
  if (!set(key)) add('flw-key', 'Flutterwave secret key', 'red', 'FLW_SECRET_KEY is not set.', 'Add FLW_SECRET_KEY (live) in Vercel.')
  else if (key!.toUpperCase().includes('_TEST')) add('flw-key', 'Flutterwave secret key', 'red', 'The key is a test key.', 'Replace FLW_SECRET_KEY with the live key in Vercel.')
  else add('flw-key', 'Flutterwave secret key', 'green', 'Set, and it is a live key.', null)
  add('flw-hash', 'Flutterwave webhook hash', set(env.FLW_SECRET_HASH), set(env.FLW_SECRET_HASH) ? 'Set.' : 'FLW_SECRET_HASH is not set.',
    'Add FLW_SECRET_HASH in Vercel, the same value as in the Flutterwave webhook settings.')

  const from = (env.EMAIL_FROM ?? '').trim()
  const resendOk = set(env.RESEND_API_KEY) && from.length > 0
  const domainOk = /@finalheaven\.shop>?$/i.test(from)
  if (!resendOk) add('resend', 'Resend email', 'red', [!set(env.RESEND_API_KEY) && 'RESEND_API_KEY is not set', !from && 'EMAIL_FROM is not set'].filter(Boolean).join('; ') + '.', 'Add RESEND_API_KEY and EMAIL_FROM in Vercel.')
  else if (!domainOk) add('resend', 'Resend email', 'amber', 'EMAIL_FROM does not end with @finalheaven.shop.', 'Send from an @finalheaven.shop address, so mail passes spam checks.')
  else add('resend', 'Resend email', 'green', 'Key set; sending from @finalheaven.shop.', null)
  add('resend-webhook', 'Resend webhook secret', set(env.RESEND_WEBHOOK_SECRET), set(env.RESEND_WEBHOOK_SECRET) ? 'Set.' : 'RESEND_WEBHOOK_SECRET is not set.',
    'Add the signing secret from the Resend webhook in Vercel.')
  add('staff-alert', 'Staff alert email', set(env.STAFF_ALERT_EMAIL), set(env.STAFF_ALERT_EMAIL) ? 'Set.' : 'STAFF_ALERT_EMAIL is not set, so new orders and messages alert nobody.',
    'Add STAFF_ALERT_EMAIL in Vercel.')
  add('cron', 'Cron secret', set(env.CRON_SECRET), set(env.CRON_SECRET) ? 'Set.' : 'CRON_SECRET is not set, so the daily jobs cannot run.',
    'Add CRON_SECRET in Vercel.')
  const url = (env.SITE_URL ?? '').trim().replace(/\/+$/, '')
  add('site-url', 'Site address', url === SITE, url === SITE ? `SITE_URL is ${SITE}.` : set(env.SITE_URL) ? `SITE_URL is ${url}.` : 'SITE_URL is not set.',
    `Set SITE_URL to ${SITE} in Vercel.`)

  add('owner', 'An active owner', s.activeOwners > 0, s.activeOwners > 0 ? `${s.activeOwners} active owner${s.activeOwners === 1 ? '' : 's'}.` : 'No active Owner membership.',
    'Give a team member the Owner role in Settings.')
  add('mfa', 'Two-step sign-in enforced', s.mfaLockApplied ? 'green' : 'amber',
    s.mfaLockApplied ? 'The database requires two-step sign-in for staff.' : 'Staff are not yet locked out without two-step sign-in.',
    'apply 20261028140000_staff_mfa.sql after the owner sets up two-step sign-in')

  const missing = Object.keys(LEGAL_LABELS).filter((k) => !legal[k]).map((k) => LEGAL_LABELS[k])
  add('legal', 'Legal business details', missing.length === 0 ? 'green' : 'amber',
    missing.length ? `Missing: ${missing.join(', ')}.` : 'All set.', 'Fill in BUSINESS in lib/legal.ts (shown on the legal pages and footer).')

  add('products', `At least ${MIN_PRODUCTS} products`, s.activeProducts >= MIN_PRODUCTS ? 'green' : 'amber',
    `${s.activeProducts} active product${s.activeProducts === 1 ? '' : 's'}.`, `Add ${MIN_PRODUCTS - s.activeProducts} more active products.`)
  add('photos', 'Every active product has a photo', s.activeWithoutPhoto === 0,
    s.activeWithoutPhoto === 0 ? 'All have a photo.' : `${s.activeWithoutPhoto} active without a photo.`, 'Add photos, or set those products to draft.')
  return items
}

/** Worst first for the summary line. */
export function summarise(items: CheckItem[]) {
  return { red: items.filter((i) => i.level === 'red').length, amber: items.filter((i) => i.level === 'amber').length, green: items.filter((i) => i.level === 'green').length }
}
