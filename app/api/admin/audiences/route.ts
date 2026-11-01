import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, requestIdOf } from '@/lib/api'
import { audienceCsv } from '@/lib/ads/audience'
import { AUDIENCES, PURCHASER_DAYS, isAudienceKind } from '@/lib/ads/audiences'

export const dynamic = 'force-dynamic'

/**
 * Downloads a customer list for Meta's custom audiences (?kind=purchasers or
 * subscribers): one column, "email", holding the SHA-256 of each lower-cased,
 * trimmed address. The same permission as the customer list (customers.read);
 * the database function applies it again. Every download is written to the
 * audit log with its count, never with the addresses. Nothing is sent to Meta:
 * staff upload the file by hand.
 */
export const GET = handle('admin.audiences.export', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('customers.read')
  if (denied) return denied

  const kind = new URL(req.url).searchParams.get('kind')
  if (!isAudienceKind(kind)) throw new BadRequest('Choose purchasers or subscribers.')

  const { data, error } = await staff.supabase.rpc('audience_emails', { p_tenant: staff.tenant.tenantId, p_kind: kind, p_days: PURCHASER_DAYS })
  if (error) throw error
  const { csv, count } = audienceCsv((data ?? []) as string[])

  await audit({
    tenantId: staff.tenant.tenantId, action: 'audience.exported', entityType: 'audience', entityId: kind,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req),
    metadata: { kind, count, ...(kind === 'purchasers' ? { days: PURCHASER_DAYS } : {}), format: 'sha256' },
  })

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${AUDIENCES[kind].file}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
})
