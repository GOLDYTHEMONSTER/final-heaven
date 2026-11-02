// An event's numbers for Studio (app/api/admin/events/[id]/analytics). Pure:
// rows in, figures out, so it's tested without a database
// (tests/unit/event-analytics.test.ts).
//
// Visitors come from the store's own first-party analytics: page views of
// /events/<slug>. A visitor is counted once per day (analytics_events keeps
// only a daily-rotating visitor hash, by design), so "visitors" sums daily
// visitors.

export type Row = Record<string, unknown>
export type Input = {
  currency: string
  tiers: { id: string; name: string; capacity: number; price: number | string }[]
  orders: { id: string; total: number | string; discount: number | string; promo_code: string | null; status: string; payment_status: string; created_at: string }[]
  tickets: { ticket_order_id: string; ticket_type_id: string; status: string; checked_in_at: string | null; checked_in_door: string | null }[]
  checkouts: { created_at: string; ticket_order_id: string | null }[]
  /** Page views of the event page; null when the viewer can't read analytics. */
  views: { occurred_at: string; visitor_day: string | null; referrer_host: string | null; utm_source: string | null; device: string | null }[] | null
  doorLinks: { id: string; label: string }[]
}

export type Count = { label: string; value: number }
export type Day = { key: string; label: string; views: number; tickets: number; revenue: number }

/** The days to chart: up to 30, ending today or on the event's day if that's sooner. */
export const DAYS = 30

const dayKey = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone })
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function top(counts: Map<string, number>, n: number): Count[] {
  const rows = [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  if (rows.length <= n) return rows
  const rest = rows.slice(n - 1).reduce((s, r) => s + r.value, 0)
  return [...rows.slice(0, n - 1), { label: 'Other', value: rest }]
}

/** Where a visit came from: its campaign source, else the site that linked to it, else direct. */
export function sourceOf(v: { referrer_host: string | null; utm_source: string | null }): string {
  const s = v.utm_source?.trim() || v.referrer_host?.trim().replace(/^(www\.|l\.|lm\.|m\.)/, '')
  if (!s) return 'Direct'
  if (/instagram/i.test(s)) return 'Instagram'
  if (/facebook|fb\b/i.test(s)) return 'Facebook'
  if (/whatsapp|wa\.me/i.test(s)) return 'WhatsApp'
  if (/t\.co$|twitter|x\.com/i.test(s)) return 'X'
  if (/tiktok/i.test(s)) return 'TikTok'
  if (/google/i.test(s)) return 'Google'
  if (/finalheaven/i.test(s)) return 'Final Heaven site'
  return s
}

export function eventAnalytics(input: Input, { now = new Date(), timeZone = 'Africa/Lagos', startsAt }: { now?: Date; timeZone?: string; startsAt: string }) {
  const live = new Set(input.orders.filter((o) => o.status === 'confirmed').map((o) => o.id))
  const paid = input.orders.filter((o) => o.status === 'confirmed' && o.payment_status === 'paid')
  const sold = input.tickets.filter((t) => t.status !== 'void' && live.has(t.ticket_order_id))
  const inside = sold.filter((t) => t.status === 'checked_in')
  const views = input.views ?? []
  const visitorDays = new Set(views.map((v) => `${dayKey(v.occurred_at, timeZone)}:${v.visitor_day ?? ''}`))
  const visitors = views.length ? visitorDays.size : 0
  const revenue = paid.reduce((s, o) => s + Number(o.total), 0)
  const capacity = input.tiers.reduce((s, t) => s + t.capacity, 0)

  // Days: the last DAYS days up to today, or up to the event day once it has passed.
  const end = new Date(Math.min(now.getTime(), new Date(startsAt).getTime() + 86_400_000))
  const days: Day[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const key = dayKey(new Date(end.getTime() - i * 86_400_000).toISOString(), timeZone)
    if (!days.some((d) => d.key === key)) days.push({ key, label: dayLabel(key), views: 0, tickets: 0, revenue: 0 })
  }
  const byDay = new Map(days.map((d) => [d.key, d]))
  for (const v of views) { const d = byDay.get(dayKey(v.occurred_at, timeZone)); if (d) d.views += 1 }
  const ticketsPerOrder = new Map<string, number>()
  for (const t of sold) ticketsPerOrder.set(t.ticket_order_id, (ticketsPerOrder.get(t.ticket_order_id) ?? 0) + 1)
  for (const o of paid) {
    const d = byDay.get(dayKey(o.created_at, timeZone))
    if (d) { d.revenue += Number(o.total); d.tickets += ticketsPerOrder.get(o.id) ?? 0 }
  }
  // Trim the empty days before anything happened, keeping at least a week.
  const first = days.findIndex((d) => d.views || d.tickets)
  const shown = days.slice(Math.max(0, Math.min(first < 0 ? days.length : first, days.length - 7)))

  const sources = new Map<string, number>()
  const devices = new Map<string, number>()
  for (const v of views) {
    sources.set(sourceOf(v), (sources.get(sourceOf(v)) ?? 0) + 1)
    const device = v.device ? v.device[0].toUpperCase() + v.device.slice(1) : 'Unknown'
    devices.set(device, (devices.get(device) ?? 0) + 1)
  }

  const hours = new Map<string, number>()
  for (const t of [...inside].sort((a, b) => a.checked_in_at!.localeCompare(b.checked_in_at!))) {
    const h = new Date(t.checked_in_at!).toLocaleTimeString('en-GB', { hour: 'numeric', hour12: true, timeZone }).replace(' ', '')
    hours.set(h, (hours.get(h) ?? 0) + 1)
  }
  const doors = new Map<string, number>()
  const linkName = new Map(input.doorLinks.map((l) => [l.id, l.label]))
  for (const t of inside) {
    const by = t.checked_in_door ? linkName.get(t.checked_in_door) ?? 'Door link' : 'Studio staff'
    doors.set(by, (doors.get(by) ?? 0) + 1)
  }

  const started = input.checkouts.length
  return {
    totals: {
      views: views.length,
      visitors,
      checkoutsStarted: started,
      paidOrders: paid.length,
      /** Paid orders per visitor, 0–1; null without traffic. */
      conversion: input.views && visitors ? paid.length / visitors : null,
      /** Started checkouts that never paid. */
      abandoned: input.checkouts.filter((c) => !c.ticket_order_id).length,
      ticketsSold: sold.length,
      capacity,
      revenue,
      averageOrder: paid.length ? revenue / paid.length : 0,
      discountGiven: paid.reduce((s, o) => s + Number(o.discount), 0),
      codesUsed: paid.filter((o) => o.promo_code).length,
      checkedIn: inside.length,
      checkInRate: sold.length ? inside.length / sold.length : 0,
      cancelledOrders: input.orders.filter((o) => o.status === 'cancelled').length,
      refunded: input.orders.filter((o) => o.payment_status === 'refunded').length,
    },
    traffic: input.views !== null,
    funnel: [
      { label: 'Visitors', value: visitors },
      { label: 'Started checkout', value: started },
      { label: 'Paid', value: paid.length },
    ] as Count[],
    days: shown,
    tiers: input.tiers.map((t) => {
      const n = sold.filter((s) => s.ticket_type_id === t.id).length
      // At the tier's current price, before any waitlist discount.
      return { name: t.name, sold: n, capacity: t.capacity, atPrice: n * Number(t.price) }
    }),
    sources: top(sources, 6),
    devices: top(devices, 4),
    checkInsByHour: [...hours].map(([label, value]) => ({ label, value })),
    doors: top(doors, 6),
  }
}

export type EventAnalytics = ReturnType<typeof eventAnalytics>
