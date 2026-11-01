// The early access offer (supabase/migrations/20261101400000_early_access.sql).
// Everyone who subscribes before checkout opens gets a personal code: 25% off
// their first order and 2 months of membership free when membership opens.
// Each friend they invite adds 5% when the friend subscribes and 5% more when
// the friend's first order is paid, up to 35%. The code works for its owner's
// email only, once, until the end of the 30th day after launch day.
import { addDays } from '@/lib/delivery'

export const EARLY_ACCESS = {
  basePercent: 25,
  perCreditPercent: 5,
  maxPercent: 35,
  daysAfterLaunch: 30,
  freeMembershipMonths: 2,
} as const

/** The percent a personal code takes off, from the number of invite credits its owner has. */
export function earlyPercent(credits: number): number {
  const n = Math.max(0, Math.floor(credits))
  return Math.min(EARLY_ACCESS.maxPercent, EARLY_ACCESS.basePercent + n * EARLY_ACCESS.perCreditPercent)
}

/** When a personal code stops working: the end of the 30th day after launch (Lagos), or null while there's no launch day. */
export function earlyEndsAt(paymentsOpenOn: string | null): string | null {
  if (!paymentsOpenOn) return null
  return `${addDays(paymentsOpenOn.slice(0, 10), EARLY_ACCESS.daysAfterLaunch)}T23:59:59+01:00`
}

/** Whether someone signing up now is early: checkout hasn't opened yet. `today` is the store's day (YYYY-MM-DD). */
export const isEarly = (paymentsOpenOn: string | null, today: string) => !paymentsOpenOn || paymentsOpenOn.slice(0, 10) > today

/** The link a subscriber shares: the store, which opens the waitlist sign-up with their code (components/launch/LaunchGate). */
export const inviteLink = (site: string, code: string) => `${site.replace(/\/$/, '')}/?invite=${encodeURIComponent(code)}`

/** A code as typed into an invite link: the same shape as a promo code, or null. */
export function parseInvite(value: unknown): string | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z0-9_-]{3,30}$/.test(code) ? code : null
}
