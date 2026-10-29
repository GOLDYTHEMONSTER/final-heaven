import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/log'
import { createResendSender } from './resend'
import { emailConfigFromEnv } from './index'
import { isSuppressed } from './suppression'
import { cancelCheckoutReminder, scheduleCheckoutReminder, type CancelResult, type ReminderDeps, type ReminderStore, type ScheduleResult } from './reminders'

export function supabaseReminderStore(db: SupabaseClient = createSupabaseServiceClient()): ReminderStore {
  return {
    async checkout(id) {
      const { data, error } = await db.from('checkouts').select('id, tenant_id, email, items, currency, total').eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      const items = Array.isArray(data.items) ? data.items : []
      return {
        id: data.id, tenantId: data.tenant_id, email: String(data.email), currency: data.currency, total: String(data.total),
        items: items.map((i: Record<string, any>) => ({
          name: String(i.name ?? 'Item'), quantity: Number(i.quantity ?? 1), size: i.size ?? null, color: i.color ?? null,
          price: i.price ?? 0, preorder: Boolean(i.preorder), shipsOn: i.ships_on ?? null, gift: Boolean(i.gift),
          madeToOrderDays: i.made_to_order ? Number(i.lead_time_days) || null : null,
        })),
      }
    },
    suppressed: (tenantId, email) => isSuppressed(db, tenantId, email),
    async claim(id, dailyCap) {
      const { data, error } = await db.rpc('claim_checkout_reminder', { p_checkout: id, p_daily_cap: dailyCap })
      if (error) throw error
      return data
    },
    async saved(id, emailId) {
      const { error } = await db.from('checkouts').update({ reminder_email_id: emailId }).eq('id', id)
      if (error) throw error
    },
    async release(id) {
      const { error } = await db.from('checkouts').update({ reminder_scheduled_at: null }).eq('id', id).is('reminder_email_id', null)
      if (error) throw error
    },
    async scheduled(id) {
      const { data, error } = await db.from('checkouts').select('reminder_email_id, reminder_cancelled_at').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? { emailId: data.reminder_email_id ?? null, cancelledAt: data.reminder_cancelled_at ?? null } : null
    },
    async markCancelled(id) {
      const { error } = await db.from('checkouts').update({ reminder_cancelled_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
  }
}

/** Short timeout: scheduling happens while the shopper waits to be sent to the payment page. */
function reminderDeps(): ReminderDeps {
  const apiKey = process.env.RESEND_API_KEY
  return {
    store: supabaseReminderStore(),
    sender: apiKey ? createResendSender({ apiKey, timeoutMs: 4000 }) : null,
    config: emailConfigFromEnv(),
    log: (event, fields) => logger.warn(event, fields),
  }
}

/** Never throws: a missing reminder must never get in the way of paying. */
export async function scheduleReminder(checkoutId: string, paymentsOpen: boolean): Promise<ScheduleResult> {
  try {
    return await scheduleCheckoutReminder(reminderDeps(), checkoutId, { paymentsOpen })
  } catch (error) {
    logger.warn('reminder.schedule_error', { checkoutId, error })
    return 'failed'
  }
}

/** Never throws; the reminder's own wording ("if you've already paid, ignore this") covers a failed cancel. */
export async function cancelReminder(checkoutId: string): Promise<CancelResult> {
  try {
    return await cancelCheckoutReminder(reminderDeps(), checkoutId)
  } catch (error) {
    logger.warn('reminder.cancel_error', { checkoutId, error })
    return 'failed'
  }
}
