// Addresses we must not email (hard bounces, spam complaints), filled by the
// Resend webhook (app/api/webhooks/resend). Every automatic sender checks it
// before it sends: outbox delivery, campaigns, reminders and alerts.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/** The lower-cased addresses among `emails` that are suppressed for this tenant. */
export async function suppressedAmong(db: SupabaseClient, tenantId: string, emails: string[]): Promise<Set<string>> {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (!wanted.length) return new Set()
  const { data, error } = await db.from('email_suppressions').select('email').eq('tenant_id', tenantId).in('email', wanted)
  if (error) throw error
  return new Set((data ?? []).map((r) => String(r.email)))
}

export async function isSuppressed(db: SupabaseClient, tenantId: string, email: string) {
  return (await suppressedAmong(db, tenantId, [email])).has(email.trim().toLowerCase())
}
