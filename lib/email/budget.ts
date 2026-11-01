// The Resend free plan's budget (100 emails a day, 3,000 a month, shared by
// everything) and how much of it marketing may use. Pure; the counts come from
// the database (public.email_usage, ./batches-store.ts). Receipts and staff
// mail are never capped: marketing is held back so they always have room.

import type { SupabaseClient } from '@supabase/supabase-js'

export const PLAN_DAILY = 100
export const PLAN_MONTHLY = 3000
/** Marketing sends in a UTC day, so 40 are always left for receipts and alerts. */
export const MARKETING_DAILY = 60
/** Marketing stops for the month here, leaving 300 for receipts. */
export const MARKETING_MONTHLY_STOP = 2700

export type EmailUsage = {
  today: { total: number; marketing: number }
  month: { total: number; marketing: number }
}

/** The figures public.email_usage returns, tolerant of a missing or odd value. */
export function parseUsage(v: unknown): EmailUsage {
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, Record<string, unknown> | undefined>
  return {
    today: { total: n(o.today?.total), marketing: n(o.today?.marketing) },
    month: { total: n(o.month?.total), marketing: n(o.month?.marketing) },
  }
}

/** How many more marketing emails may go out now: the least of the daily, monthly and plan room. */
export function marketingAllowance(u: EmailUsage): number {
  return Math.max(0, Math.min(MARKETING_DAILY - u.today.marketing, MARKETING_MONTHLY_STOP - u.month.marketing, PLAN_DAILY - u.today.total))
}

/** Why marketing can't send now, or null when it can. */
export function marketingPause(u: EmailUsage): string | null {
  if (u.month.marketing >= MARKETING_MONTHLY_STOP) return `Marketing is paused for the month (${MARKETING_MONTHLY_STOP.toLocaleString('en-GB')} sent; the rest of the ${PLAN_MONTHLY.toLocaleString('en-GB')} is kept for receipts).`
  if (u.today.marketing >= MARKETING_DAILY) return `Today’s ${MARKETING_DAILY} marketing sends are used. It carries on tomorrow.`
  if (u.today.total >= PLAN_DAILY) return `Today’s ${PLAN_DAILY} emails are used. It carries on tomorrow.`
  return null
}

/**
 * What approving a batch of `recipients` costs. `ahead` is how many are still
 * queued in batches approved earlier (they go first). Says whether it finishes
 * today and, if not, how many days it spreads over.
 */
export function quotaImpact(recipients: number, usage: EmailUsage, ahead = 0): { today: number; days: number; text: string } {
  const room = Math.max(0, marketingAllowance(usage) - ahead)
  const today = Math.min(recipients, room)
  const days = recipients <= room ? (recipients ? 1 : 0) : (room > 0 ? 1 : 0) + Math.ceil((recipients - room) / MARKETING_DAILY)
  const monthLeft = MARKETING_MONTHLY_STOP - usage.month.marketing - ahead
  const monthNote = recipients > monthLeft ? ` The month’s marketing limit (${MARKETING_MONTHLY_STOP.toLocaleString('en-GB')}) means only ${Math.max(0, monthLeft)} can go before next month.` : ''
  if (!recipients) return { today: 0, days: 0, text: 'Nobody is in this batch.' }
  const text = recipients <= room
    ? `Uses ${recipients} of today’s ${MARKETING_DAILY} marketing sends, finishes today.${monthNote}`
    : `Uses ${today} of today’s ${MARKETING_DAILY} marketing sends, then spreads over ${days} day${days === 1 ? '' : 's'} (${MARKETING_DAILY} a day at most).${monthNote}`
  return { today, days, text }
}

/** The Outbox header line. */
export function usageLine(u: EmailUsage): string {
  return `${u.month.total.toLocaleString('en-GB')} of ${PLAN_MONTHLY.toLocaleString('en-GB')} this month · ${u.today.total} of ${PLAN_DAILY} today`
}

/** Over 2,000 a month is the sign to move to a paid Resend plan (for two months running). */
export const UPGRADE_SIGN = 2000

/** What has gone out today (UTC) and this month, across the outbox, campaigns and batches (public.email_usage). */
export async function emailUsage(db: SupabaseClient, tenantId: string): Promise<EmailUsage> {
  const { data, error } = await db.rpc('email_usage', { p_tenant: tenantId })
  if (error) throw error
  return parseUsage(data)
}
