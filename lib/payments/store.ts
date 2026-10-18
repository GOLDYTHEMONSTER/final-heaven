import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import type { ApplyOutcome, BacklogEvent, PaymentRecord, PaymentStore } from './service'
import type { VerifiedTransaction } from './types'

const PAYMENT_COLUMNS = 'id, reference, tenant_id, order_id, amount_minor, currency, status, checkout_url, created_at, orders(order_number)'

function toRecord(row: Record<string, any>): PaymentRecord {
  return {
    id: row.id,
    reference: row.reference,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    orderNumber: row.orders?.order_number ?? '',
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    status: row.status,
    checkoutUrl: row.checkout_url,
    createdAt: row.created_at,
  }
}

/** Payment persistence on Supabase. Server-only: uses the service key. */
export function supabasePaymentStore(db: SupabaseClient = createSupabaseServiceClient()): PaymentStore {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

  return {
    async findReusableAttempt(orderId, maxAgeMinutes) {
      const { data, error } = await db.from('payments').select(PAYMENT_COLUMNS)
        .eq('order_id', orderId).in('status', ['initiated', 'pending']).not('checkout_url', 'is', null)
        .gte('created_at', minutesAgo(maxAgeMinutes)).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data ? toRecord(data) : null
    },

    async createAttempt(a) {
      const { error } = await db.from('payments').insert({
        tenant_id: a.tenantId, order_id: a.orderId, provider: a.provider, reference: a.reference,
        amount_minor: a.amountMinor, currency: a.currency, status: 'initiated',
      })
      if (error) throw error
    },

    async setCheckoutUrl(reference, url) {
      const { error } = await db.from('payments').update({ checkout_url: url }).eq('reference', reference)
      if (error) throw error
    },

    async recordInitFailure(reference, reason) {
      const { error } = await db.from('payments').update({ failure_reason: `initiate: ${reason}`.slice(0, 500) })
        .eq('reference', reference).eq('status', 'initiated')
      if (error) throw error
    },

    async getByReference(reference) {
      const { data, error } = await db.from('payments').select(PAYMENT_COLUMNS).eq('reference', reference).maybeSingle()
      if (error) throw error
      return data ? toRecord(data) : null
    },

    async applyVerified(tx: VerifiedTransaction) {
      const { data, error } = await db.rpc('apply_verified_payment', {
        p_reference: tx.reference,
        p_provider_transaction_id: tx.providerTransactionId,
        p_status: tx.status,
        p_amount_minor: tx.amountMinor,
        p_currency: tx.currency,
        p_failure_reason: tx.failureReason,
      })
      if (error) throw error
      return data as ApplyOutcome
    },

    async storeEvent(e) {
      const { data, error } = await db.from('payment_events').insert({
        provider: e.provider, dedupe_key: e.dedupeKey, event_type: e.eventType,
        provider_transaction_id: e.providerTransactionId, reference: e.reference, payload: e.payload,
      }).select('id').single()
      if (error?.code === '23505') return { id: '', duplicate: true }
      if (error) throw error
      return { id: data.id, duplicate: false }
    },

    async finishEvent(id, r) {
      const { data: current, error: readError } = await db.from('payment_events').select('attempts').eq('id', id).single()
      if (readError) throw readError
      const { error } = await db.from('payment_events').update({
        status: r.status,
        attempts: (current?.attempts ?? 0) + 1,
        last_error: r.error ?? null,
        tenant_id: r.tenantId ?? undefined,
        payment_id: r.paymentId ?? undefined,
        processed_at: r.status === 'failed' ? null : new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },

    async eventBacklog(limit, maxAttempts): Promise<BacklogEvent[]> {
      // Skip events younger than two minutes: their webhook request may still be processing them.
      const { data, error } = await db.from('payment_events')
        .select('id, event_type, provider_transaction_id, reference, attempts')
        .in('status', ['received', 'failed']).lt('attempts', maxAttempts).lt('received_at', minutesAgo(2))
        .order('received_at').limit(limit)
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id, eventType: r.event_type, providerTransactionId: r.provider_transaction_id,
        reference: r.reference, attempts: r.attempts,
      }))
    },

    async stalePayments(olderThanMinutes, limit) {
      const { data, error } = await db.from('payments').select(PAYMENT_COLUMNS)
        .eq('provider', 'flutterwave').in('status', ['initiated', 'pending'])
        .lt('created_at', minutesAgo(olderThanMinutes)).order('created_at').limit(limit)
      if (error) throw error
      return (data ?? []).map(toRecord)
    },

    async markAbandoned(reference) {
      const { error } = await db.from('payments').update({ status: 'abandoned' })
        .eq('reference', reference).in('status', ['initiated', 'pending'])
      if (error) throw error
    },
  }
}
