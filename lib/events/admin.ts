// Reading and checking what Studio sends for events and tiers. Dates and times
// are the store's (Lagos, UTC+1, no daylight saving), as for promo codes.
import { BadRequest, int, money, text } from '@/lib/api'
import { slugify, type EventStatus } from './index'

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
/** Slugs that are pages of their own under /events. */
const RESERVED = new Set(['complete'])

/** "2026-11-21T20:00" in Lagos time -> ISO, or null for empty. */
export function lagosTime(value: unknown, field: string): string | null {
  if (value === '' || value == null) return null
  if (typeof value !== 'string' || !LOCAL.test(value)) throw new BadRequest(`${field} must be a date and time.`)
  return new Date(`${value}:00+01:00`).toISOString()
}

/** ISO -> "2026-11-21T20:00" in Lagos time, for a datetime-local field. */
export function toLagosInput(iso: string | null): string {
  if (!iso) return ''
  return new Date(new Date(iso).getTime() + 3_600_000).toISOString().slice(0, 16)
}

export type EventInput = {
  title: string; slug: string; description: string; venue: string; address: string; image_url: string | null
  starts_at: string; ends_at: string | null; sales_open_at: string | null; sales_close_at: string | null
  max_per_order: number; terms: string
}

/** An event's details from a Studio form. `partial` leaves out fields that weren't sent. */
export function readEvent(body: Record<string, unknown>, { partial = false } = {}): Partial<EventInput> {
  const out: Partial<EventInput> = {}
  const has = (k: string) => !partial || k in body
  if (has('title')) out.title = text(body.title, 'Title', { max: 120, required: true })!
  if (has('slug') || (!partial && out.title)) {
    const slug = (typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim().toLowerCase() : slugify(out.title ?? ''))
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) throw new BadRequest('The address can use lower-case letters, numbers and dashes.')
    if (RESERVED.has(slug)) throw new BadRequest('Choose another address for this event.')
    out.slug = slug
  }
  if (has('description')) out.description = text(body.description, 'Description', { max: 4000 }) ?? ''
  if (has('venue')) out.venue = text(body.venue, 'Venue', { max: 200 }) ?? ''
  if (has('address')) out.address = text(body.address, 'Address', { max: 300 }) ?? ''
  if (has('image_url')) {
    const url = text(body.image_url, 'Image', { max: 500 })
    if (url && !/^(https:\/\/|\/)/.test(url)) throw new BadRequest('The image must be an https:// link.')
    out.image_url = url
  }
  if (has('starts_at')) {
    const starts = lagosTime(body.starts_at, 'Start')
    if (!starts) throw new BadRequest('Say when the event starts.')
    out.starts_at = starts
  }
  if (has('ends_at')) out.ends_at = lagosTime(body.ends_at, 'End')
  if (has('sales_open_at')) out.sales_open_at = lagosTime(body.sales_open_at, 'Sales open')
  if (has('sales_close_at')) out.sales_close_at = lagosTime(body.sales_close_at, 'Sales close')
  if (has('max_per_order')) out.max_per_order = body.max_per_order === '' || body.max_per_order == null ? 6 : int(body.max_per_order, 'Tickets per order', { min: 1, max: 20 })
  if (has('terms')) out.terms = text(body.terms, 'Ticket terms', { max: 2000 }) ?? ''
  if (out.starts_at && out.ends_at && out.ends_at <= out.starts_at) throw new BadRequest('The event ends before it starts.')
  if (out.sales_open_at && out.sales_close_at && out.sales_close_at <= out.sales_open_at) throw new BadRequest('Sales close before they open.')
  return out
}

/** Which status changes Studio may make. A cancelled event stays cancelled. */
export function canMove(from: EventStatus, to: EventStatus): boolean {
  if (from === to) return true
  if (from === 'cancelled') return false
  return to === 'published' || to === 'cancelled' || (to === 'draft' && from === 'published')
}

export type TierInput = { name: string; description: string; price: number; capacity: number; sort: number; active: boolean }

export function readTier(body: Record<string, unknown>): TierInput {
  const price = money(body.price, 'Price')
  if (price < 100) throw new BadRequest('A ticket costs at least ₦100, the smallest amount we charge online.')
  return {
    name: text(body.name, 'Ticket name', { max: 60, required: true })!,
    description: text(body.description, 'Ticket description', { max: 300 }) ?? '',
    price,
    capacity: int(body.capacity, 'Capacity', { min: 1, max: 100_000 }),
    sort: body.sort === '' || body.sort == null ? 0 : int(body.sort, 'Order', { min: 0, max: 100 }),
    active: body.active !== false,
  }
}
