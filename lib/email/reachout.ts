// Marketing triggers (docs/erp/07-reachout.md): who qualifies for each held
// email, and what it says. Pure (people and history in, decisions out) so the
// rules can be unit-tested; ./reachout-store.ts gathers the data and creates
// the held batches. Nothing here sends anything: every email made from these
// waits in Studio → Outbox for the owner's approval.
import { POLICY } from '@/lib/legal'
import type { CampaignContent } from './campaign'
import { welcomeCopy } from './lifecycle'
import { launchCampaignContent } from './launch'

export type BatchTrigger =
  | 'welcome_backfill' | 'welcome' | 'nurture_3d' | 'nurture_7d' | 'launch'
  | 'rt_viewed' | 'rt_low_stock' | 'review_ask' | 'winback_120' | 'winback_180'

/** The doc's code for each trigger, a name for Studio, and the sentence saying why people are in it. */
export const TRIGGERS: Record<BatchTrigger, { code: string; label: string; why: string }> = {
  welcome_backfill: { code: 'M1', label: 'Welcome (people who never got one)', why: 'They subscribed and agreed to emails but were never sent a welcome.' },
  welcome: { code: 'M2', label: 'Welcome (new sign-ups)', why: 'They just subscribed. New sign-ups wait here until the welcome wording is approved once.' },
  nurture_3d: { code: 'M3', label: 'Nurture 1: the shop', why: 'They subscribed about 3 days ago and haven’t ordered.' },
  nurture_7d: { code: 'M4', label: 'Nurture 2: fit, delivery, returns', why: 'They subscribed about a week ago and haven’t ordered.' },
  launch: { code: 'M5', label: 'We’re open', why: 'The launch waitlist, now that checkout has opened. Sent once.' },
  rt_viewed: { code: 'R1', label: 'Still thinking about it?', why: 'They viewed the same piece twice in a week and haven’t bought it.' },
  rt_low_stock: { code: 'R2', label: 'Almost gone', why: 'They viewed a piece that is now down to its last few.' },
  review_ask: { code: 'W1', label: 'How is it?', why: 'Their order was delivered about 3 weeks ago.' },
  winback_120: { code: 'W2', label: 'New since you last shopped', why: 'Their last order was about 120 days ago.' },
  winback_180: { code: 'W3', label: 'Win-back', why: 'Their last order was about 180 days ago.' },
}
export const isTrigger = (v: unknown): v is BatchTrigger => typeof v === 'string' && v in TRIGGERS

/** At most one marketing email to a person in this many days. */
export const MARKETING_GAP_DAYS = 3
/** Retargeting looks at this many days of views, and doesn't repeat itself within RETARGET_REPEAT_DAYS. */
export const VIEW_WINDOW_DAYS = 7
export const RETARGET_REPEAT_DAYS = 14
/** "Almost gone" is a piece with 1 to this many left. */
export const LOW_STOCK_NOTICE = 3
/** Nurture goes to people this many days after subscribing; the upper bound stops a first run from mailing old sign-ups. */
export const NURTURE_WINDOWS = { nurture_3d: [3, 10], nurture_7d: [7, 14] } as const
/** Delivered / last-order ages in days (from, up to). */
export const REVIEW_ASK_WINDOW = [21, 28] as const
export const WINBACK_WINDOWS = { winback_120: [120, 150], winback_180: [180, 210] } as const

const DAY = 86_400_000
const ageDays = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / DAY

export type Person = { id: string; email: string; source: string | null; subscribedAt: string; consentedAt: string | null; unsubscribedAt: string | null }
/** Someone who qualifies for a trigger, the piece it is about (if any) and why. */
export type Due = { person: Person; productId: string | null; why: string }

const canonical = (e: string) => e.trim().toLowerCase()

// ---------------------------------------------------------------------------
// The rules every marketing email follows
// ---------------------------------------------------------------------------

export type Gate = {
  now: Date
  /** Lower-cased suppressed addresses (bounced or complained). */
  suppressed: Set<string>
  /** When each subscriber was last sent, or queued for, any marketing email. */
  lastContact: Map<string, Date>
  /** Subscribers who already have this trigger (in any batch, skipped included). */
  had: Set<string>
}

/**
 * Consented, still subscribed, not suppressed, not contacted in the last
 * MARKETING_GAP_DAYS, and not already in this trigger. One person once, even if
 * several of their orders or views qualified.
 */
export function eligible(due: Due[], gate: Gate): Due[] {
  const seen = new Set<string>()
  return due.filter(({ person: p }) => {
    if (!p.consentedAt || p.unsubscribedAt || gate.suppressed.has(canonical(p.email)) || gate.had.has(p.id) || seen.has(p.id)) return false
    const last = gate.lastContact.get(p.id)
    if (last && gate.now.getTime() - last.getTime() < MARKETING_GAP_DAYS * DAY) return false
    seen.add(p.id)
    return true
  })
}

// ---------------------------------------------------------------------------
// Who qualifies
// ---------------------------------------------------------------------------

/** M1: everyone who was never sent a welcome. `welcomed` holds the subscriber ids that were. */
export function welcomeBackfillDue(people: Person[], welcomed: Set<string>): Due[] {
  return people.filter((p) => !welcomed.has(p.id)).map((person) => ({ person, productId: null, why: 'Never sent a welcome' }))
}

/** M3 and M4: subscribed long enough, within the window, no order yet. `buyers` are lower-cased order emails. */
export function nurtureDue(trigger: 'nurture_3d' | 'nurture_7d', people: Person[], buyers: Set<string>, now: Date): Due[] {
  const [from, to] = NURTURE_WINDOWS[trigger]
  return people
    .filter((p) => { const a = ageDays(p.subscribedAt, now); return a >= from && a < to && !buyers.has(canonical(p.email)) })
    .map((person) => ({ person, productId: null, why: `Subscribed ${Math.floor(ageDays(person.subscribedAt, now))} days ago, no order` }))
}

/** M5: the launch waitlist, once checkout is open. */
export function launchDue(people: Person[]): Due[] {
  return people.filter((p) => p.source === 'launch_waitlist').map((person) => ({ person, productId: null, why: 'On the launch waitlist' }))
}

export type View = { subscriberId: string; productId: string; at: string }

/**
 * R1: a subscriber who viewed the same piece twice in the last week and hasn't
 * bought it. `bought` maps subscriber id → product ids they have ordered.
 * The piece viewed most (latest on a tie) is the one the email is about.
 */
export function viewedTwiceDue(views: View[], people: Map<string, Person>, bought: Map<string, Set<string>>, now: Date): Due[] {
  const counts = new Map<string, Map<string, { n: number; last: number }>>()
  for (const v of views) {
    if (ageDays(v.at, now) > VIEW_WINDOW_DAYS || bought.get(v.subscriberId)?.has(v.productId)) continue
    const mine = counts.get(v.subscriberId) ?? new Map<string, { n: number; last: number }>()
    const c = mine.get(v.productId) ?? { n: 0, last: 0 }
    mine.set(v.productId, { n: c.n + 1, last: Math.max(c.last, new Date(v.at).getTime()) })
    counts.set(v.subscriberId, mine)
  }
  const out: Due[] = []
  for (const [id, mine] of counts) {
    const person = people.get(id)
    const best = [...mine].filter(([, c]) => c.n >= 2).sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0]
    if (person && best) out.push({ person, productId: best[0], why: `Viewed it ${best[1].n} times this week` })
  }
  return out
}

/** R2: a piece they viewed this week that is now low (`low` holds the ids with 1 to LOW_STOCK_NOTICE left). */
export function lowStockViewedDue(views: View[], people: Map<string, Person>, low: Set<string>, bought: Map<string, Set<string>>, now: Date): Due[] {
  const chosen = new Map<string, string>()
  for (const v of views) {
    if (ageDays(v.at, now) > VIEW_WINDOW_DAYS || !low.has(v.productId) || bought.get(v.subscriberId)?.has(v.productId)) continue
    chosen.set(v.subscriberId, v.productId)
  }
  return [...chosen].flatMap(([id, productId]) => {
    const person = people.get(id)
    return person ? [{ person, productId, why: 'Viewed it this week; it is nearly sold out' }] : []
  })
}

export type DeliveredOrder = { email: string; deliveredAt: string; productId: string | null }
export type PaidOrder = { email: string; paidAt: string; productId: string | null }

const byEmail = (people: Person[]) => new Map(people.map((p) => [canonical(p.email), p]))

/** W1: orders delivered 21 to 28 days ago; the email links to the first piece in the order. */
export function reviewAskDue(orders: DeliveredOrder[], people: Person[], now: Date): Due[] {
  const known = byEmail(people)
  const [from, to] = REVIEW_ASK_WINDOW
  return orders.flatMap((o) => {
    const person = known.get(canonical(o.email))
    const a = ageDays(o.deliveredAt, now)
    return person && a >= from && a < to ? [{ person, productId: o.productId, why: `Delivered ${Math.floor(a)} days ago` }] : []
  })
}

/** W2 and W3: a person's latest paid order is 120 (or 180) to 150 (or 210) days old, so nothing since. */
export function winbackDue(trigger: 'winback_120' | 'winback_180', orders: PaidOrder[], people: Person[], now: Date): Due[] {
  const known = byEmail(people)
  const [from, to] = WINBACK_WINDOWS[trigger]
  const last = new Map<string, PaidOrder>()
  for (const o of orders) {
    const k = canonical(o.email)
    if (!last.has(k) || new Date(o.paidAt) > new Date(last.get(k)!.paidAt)) last.set(k, o)
  }
  return [...last].flatMap(([k, o]) => {
    const person = known.get(k)
    const a = ageDays(o.paidAt, now)
    return person && a >= from && a < to ? [{ person, productId: null, why: `Last order ${Math.floor(a)} days ago` }] : []
  })
}

// ---------------------------------------------------------------------------
// What they say
// ---------------------------------------------------------------------------

/** The starting copy of each batch. Product cards come from each recipient's own piece (retargeting, review ask). */
export function triggerContent(trigger: BatchTrigger, source: string | null = null): CampaignContent {
  switch (trigger) {
    case 'welcome_backfill':
    case 'welcome': {
      const c = welcomeCopy(source)
      return { subject: c.subject, preheader: c.paras[0], heading: c.heading, body: c.paras.join('\n\n'), ctaLabel: c.cta, ctaUrl: '/shop' }
    }
    case 'nurture_3d':
      return {
        subject: 'A closer look at Final Heaven', preheader: 'What’s in the shop, and how to pick.', heading: 'A closer look',
        body: [
          'You joined the Final Heaven list a few days ago, so here is a proper look at the shop.',
          'Every piece has its own page with photos, the sizes and colours available, and the price you pay at checkout. Open anything that catches your eye.',
        ].join('\n\n'),
        ctaLabel: 'See the shop', ctaUrl: '/shop',
      }
    case 'nurture_7d':
      return {
        subject: 'Fit, delivery and returns', preheader: 'The questions we get most, answered.', heading: 'Before you pick',
        body: [
          'The questions we hear most, in short.',
          'Sizing: each product page lists the sizes available for that piece.',
          'Delivery: the estimate for your order is shown at checkout, before you pay.',
          `Returns: you have ${POLICY.returnWindowDays} days from delivery to return something that isn’t right.`,
          'Anything else, reply to this email and a person will answer.',
        ].join('\n\n'),
        ctaLabel: 'See the shop', ctaUrl: '/shop',
      }
    case 'launch':
      return launchCampaignContent()
    case 'rt_viewed':
      return {
        subject: 'Still thinking about it?', preheader: 'The piece you looked at is still here.', heading: 'Still thinking about it?',
        body: 'You looked at this piece more than once this week. It is still in the shop, and pieces like this can sell out.',
        ctaLabel: 'Back to the shop', ctaUrl: '/shop',
      }
    case 'rt_low_stock':
      return {
        subject: 'Almost gone', preheader: 'A piece you looked at is nearly sold out.', heading: 'Almost gone',
        body: 'A piece you looked at this week is down to its last few. If you want it, now is the time.',
        ctaLabel: 'Back to the shop', ctaUrl: '/shop',
      }
    case 'review_ask':
      return {
        subject: 'How is it?', preheader: 'One question about your order.', heading: 'One question',
        body: 'Your order arrived a few weeks ago. How is it working out?\n\nOpen the piece below and tap Hype on its page if you love it. If something isn’t right, just reply to this email.',
        ctaLabel: 'Back to the shop', ctaUrl: '/shop',
      }
    case 'winback_120':
      return {
        subject: 'New since you last shopped', preheader: 'Fresh pieces have landed.', heading: 'New since your last order',
        body: 'It has been a while since your last order. New pieces have landed in the shop since then, and some of the old ones are gone.',
        ctaLabel: 'See what’s new', ctaUrl: '/shop',
      }
    case 'winback_180':
      return {
        subject: 'It’s been a while', preheader: 'A look at what’s in the shop now.', heading: 'It’s been a while',
        body: 'Your last order was about six months ago. Here is what is in the shop now, in case something is worth coming back for.',
        ctaLabel: 'See the shop', ctaUrl: '/shop',
      }
  }
}
