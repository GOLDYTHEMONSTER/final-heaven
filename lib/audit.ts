import 'server-only'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { logger, scrub } from '@/lib/log'

export type AuditEntry = {
  tenantId: string | null
  action: string // e.g. 'product.updated'
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  actor: { type: 'user'; userId: string } | { type: 'system' | 'webhook' | 'job' }
  requestId?: string
}

/**
 * Appends to the audit log. Database triggers and functions already audit
 * order status changes and payments; this covers application actions such as
 * catalogue edits. A failure is logged, never thrown: auditing must not undo
 * the action it records, and the database-side audit covers money movements.
 */
export async function audit(entry: AuditEntry) {
  const { error } = await createSupabaseServiceClient().from('audit_events').insert({
    tenant_id: entry.tenantId,
    actor_type: entry.actor.type,
    actor_user_id: entry.actor.type === 'user' ? entry.actor.userId : null,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    request_id: entry.requestId ?? null,
    metadata: scrub(entry.metadata ?? {}),
  })
  if (error) logger.error('audit.write_failed', { action: entry.action, error })
}
