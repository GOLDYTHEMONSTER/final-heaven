import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle } from '@/lib/api'
import { eventAnalytics, type Input } from '@/lib/events/analytics'

export const dynamic = 'force-dynamic'

const ID = /^[0-9a-f-]{36}$/

/**
 * An event's numbers for its Studio page: traffic to its page, the checkout
 * funnel, sales by day and tier, discounts, and check-ins. Read as the staff
 * member, so RLS applies; traffic only for those who may read analytics.
 */
export const GET = handle('admin.events.analytics', async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  if (!ID.test(params.id)) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const db = staff.supabase
  const { data: event, error } = await db.from('events').select('id, slug, starts_at, currency').eq('id', params.id).eq('tenant_id', staff.tenant.tenantId).maybeSingle()
  if (error) throw error
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const [tiers, orders, tickets, checkouts, links, views] = await Promise.all([
    db.from('ticket_types').select('id, name, capacity, price').eq('event_id', event.id).order('sort').order('price'),
    db.from('ticket_orders').select('id, total, discount, promo_code, status, payment_status, created_at').eq('event_id', event.id).limit(10_000),
    db.from('tickets').select('ticket_order_id, ticket_type_id, status, checked_in_at, checked_in_door').eq('event_id', event.id).limit(50_000),
    db.from('ticket_checkouts').select('created_at, ticket_order_id').eq('event_id', event.id).limit(50_000),
    db.from('event_door_links').select('id, label').eq('event_id', event.id),
    staff.can('analytics.read')
      ? db.from('analytics_events').select('occurred_at, visitor_day, referrer_host, utm_source, device')
        .eq('tenant_id', staff.tenant.tenantId).eq('event_type', 'page_view').eq('path', `/events/${event.slug}`).limit(50_000)
      : Promise.resolve({ data: null, error: null }),
  ])
  for (const r of [tiers, orders, tickets, checkouts, links, views]) if (r.error) throw r.error

  const input: Input = {
    currency: event.currency,
    tiers: (tiers.data ?? []) as Input['tiers'],
    orders: (orders.data ?? []) as Input['orders'],
    tickets: (tickets.data ?? []) as Input['tickets'],
    checkouts: (checkouts.data ?? []) as Input['checkouts'],
    doorLinks: (links.data ?? []) as Input['doorLinks'],
    views: views.data as Input['views'],
  }
  const timeZone = process.env.STORE_TIMEZONE || 'Africa/Lagos'
  return NextResponse.json(eventAnalytics(input, { startsAt: event.starts_at, timeZone }), { headers: { 'Cache-Control': 'private, no-store' } })
})
