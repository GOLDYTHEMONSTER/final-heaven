// The early access offer in the database (lib/early-access.ts for the rules,
// 20261101400000_early_access.sql for the tables). Server only: service key.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { earlyPercent, inviteLink } from './early-access'
import type { EarlyFill } from './email/lifecycle'

/** How many invite credits a subscriber has (friends who joined, friends who paid). */
export async function inviteCredits(db: SupabaseClient, subscriberId: string): Promise<number> {
  const { count, error } = await db.from('invite_credits').select('id', { count: 'exact', head: true }).eq('inviter_id', subscriberId)
  if (error) throw error
  return count ?? 0
}

/** A subscriber's code, percent and invite link for their emails, or null when they have no personal code. */
export async function earlyFill(db: SupabaseClient, subscriberId: string, site: string): Promise<EarlyFill | null> {
  const { data, error } = await db.from('promo_codes').select('code').eq('subscriber_id', subscriberId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return { code: data.code, percent: earlyPercent(await inviteCredits(db, subscriberId)), inviteLink: inviteLink(site, data.code) }
}

/**
 * A sign-up before checkout opens: makes the subscriber's personal code and,
 * when they are new and came with a friend's code, credits that friend.
 * Returns the code.
 */
export async function joinEarly(db: SupabaseClient, a: { subscriberId: string; isNew: boolean; invite: string | null }): Promise<string | null> {
  const { data: code, error } = await db.rpc('ensure_early_access', { p_subscriber: a.subscriberId })
  if (error) throw error
  if (a.isNew && a.invite) {
    const { error: ie } = await db.rpc('record_invite', { p_friend: a.subscriberId, p_code: a.invite })
    if (ie) throw ie
  }
  return (code as string | null) ?? null
}
