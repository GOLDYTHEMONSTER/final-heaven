import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle } from '@/lib/api'
import { storeToday } from '@/lib/catalog'
import { BUSINESS } from '@/lib/legal'
import { computeLaunchChecklist, summarise, type LaunchSignals } from '@/lib/launch-check'

export const dynamic = 'force-dynamic'

/**
 * The launch checklist. Reads the server's settings and the database, and
 * returns only green/amber/red items: never a secret value.
 */
export const GET = handle('admin.launch-check', async () => {
  const { staff, denied } = await requirePermission('settings.manage')
  if (denied) return denied

  const { data, error } = await staff.supabase.rpc('launch_signals', { p_tenant: staff.tenant.tenantId })
  if (error) throw error

  const items = computeLaunchChecklist({
    env: process.env, signals: data as LaunchSignals, legal: BUSINESS as unknown as Record<string, string | null>, today: storeToday(),
  })
  return NextResponse.json({ items, summary: summarise(items) }, { headers: { 'Cache-Control': 'private, no-store' } })
})
