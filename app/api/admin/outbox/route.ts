import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { emailConfigFromEnv } from '@/lib/email'
import { UPGRADE_SIGN, emailUsage, usageLine } from '@/lib/email/budget'
import { BATCH_COLUMNS, type BatchRow } from '@/lib/email/batches-store'
import { TRIGGERS } from '@/lib/email/reachout'

export const dynamic = 'force-dynamic'

/** Held and approved batches with their counts, the most recent sent ones, and the send budget. */
export const GET = handle('admin.outbox.list', async () => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  const tenantId = staff.tenant.tenantId
  const [open, done] = await Promise.all([
    staff.supabase.from('email_batches').select(BATCH_COLUMNS).eq('tenant_id', tenantId).in('status', ['held', 'approved', 'sending']).order('created_at').limit(100),
    staff.supabase.from('email_batches').select(BATCH_COLUMNS).eq('tenant_id', tenantId).in('status', ['sent', 'skipped']).order('updated_at', { ascending: false }).limit(20),
  ])
  if (open.error) throw open.error
  if (done.error) throw done.error
  const batches = [...(open.data ?? []), ...(done.data ?? [])] as BatchRow[]

  const counts: Record<string, { total: number; queued: number; sent: number }> = {}
  if (batches.length) {
    const { data, error } = await staff.supabase.from('email_batch_recipients').select('batch_id, status').in('batch_id', batches.map((b) => b.id)).limit(20_000)
    if (error) throw error
    for (const r of data ?? []) {
      const c = (counts[r.batch_id] ??= { total: 0, queued: 0, sent: 0 })
      c.total += 1
      if (r.status === 'queued') c.queued += 1
      if (r.status === 'sent') c.sent += 1
    }
  }
  const usage = await emailUsage(createSupabaseServiceClient(), tenantId)
  const config = emailConfigFromEnv()
  return NextResponse.json({
    batches: batches.map((b) => ({
      ...b, code: TRIGGERS[b.trigger]?.code ?? '', label: TRIGGERS[b.trigger]?.label ?? b.trigger, ...(counts[b.id] ?? { total: 0, queued: 0, sent: 0 }),
    })),
    usage, usageLine: usageLine(usage), upgradeSign: usage.month.total > UPGRADE_SIGN,
    email: { ready: Boolean(config) },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
