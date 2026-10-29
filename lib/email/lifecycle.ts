// Automatic customer emails beyond receipts: welcome, checkout reminder, back
// in stock, delivered follow-up. Pure and rendered through layout() like every
// other email, so they match the store and can be unit-tested. Everything that
// came from a customer or the catalogue is escaped by the helpers below.
import { BUSINESS, POLICY } from '@/lib/legal'
import { LAUNCH_WINDOW } from '@/lib/catalog'
import { C, button, escapeHtml, layout, p, type RenderedEmail } from './templates'

/** Footer for emails sent because someone subscribed: why they got it, and a one-click way out. */
export function subscriberFooter({ reason, unsubscribeUrl }: { reason: string; unsubscribeUrl: string }) {
  return [
    `You’re getting this because ${escapeHtml(reason)}.`,
    `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.muted};">Unsubscribe</a> any time, in one click.`,
    `${escapeHtml(BUSINESS.tradingName)}${BUSINESS.address ? ` · ${escapeHtml(BUSINESS.address)}` : ''} · ${escapeHtml(POLICY.shipsTo)}`,
  ].join('<br>')
}

const paragraphsHtml = (paras: string[]) => paras.map((t) => p(escapeHtml(t))).join('\n')

// ---------------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------------

/** What each list's welcome says. The launch waitlist is told when we open, in the store's public wording. */
const WELCOME: Record<string, { subject: string; heading: string; paras: string[]; cta: string }> = {
  launch_waitlist: {
    subject: 'You’re on the Final Heaven waitlist',
    heading: 'You’re on the list',
    paras: [
      `Thanks for joining the Final Heaven waitlist. We open in ${LAUNCH_WINDOW}.`,
      'The moment checkout opens we’ll email you, once. Until then, the whole collection is in the shop for a look.',
    ],
    cta: 'See the shop',
  },
  membership_waitlist: {
    subject: 'You’re on the membership waitlist',
    heading: 'You’re on the list',
    paras: [
      'Thanks for joining the Final Heaven membership waitlist.',
      'Membership isn’t open yet. When it is, you’ll hear from us first. In the meantime, new drops are in the shop.',
    ],
    cta: 'See the shop',
  },
  footer: {
    subject: 'Welcome to Final Heaven',
    heading: 'Welcome to Final Heaven',
    paras: [
      'Thanks for signing up. You’ll hear from us about new drops, restocks and offers, and only when there’s something worth saying.',
    ],
    cta: 'See what’s new',
  },
}

/** Re-subscribing soon after leaving doesn't earn a second welcome. */
export const RESUBSCRIBE_WELCOME_DAYS = 30
/** Welcome emails sent store-wide in a UTC day, so they can't eat the 100 a day free quota. */
export const WELCOME_DAILY_CAP = 40

/**
 * Whether a sign-up gets a welcome. A new address does; an address already on
 * the list doesn't (it's just pressing the button again); one that unsubscribed
 * does only if that was over 30 days ago, as a fresh occasion (its own dedupe key).
 */
export function welcomeDecision(existing: { unsubscribedAt: string | null } | null, now: Date): { welcome: boolean; keySuffix: string } {
  if (!existing) return { welcome: true, keySuffix: '' }
  if (!existing.unsubscribedAt) return { welcome: false, keySuffix: '' }
  const left = new Date(existing.unsubscribedAt)
  const old = now.getTime() - left.getTime() > RESUBSCRIBE_WELCOME_DAYS * 86_400_000
  return old ? { welcome: true, keySuffix: left.toISOString().slice(0, 10) } : { welcome: false, keySuffix: '' }
}

export const welcomeCopy =(source: string | null) => WELCOME[source ?? ''] ?? WELCOME.footer

export function welcomeEmail({ source, site, unsubscribeUrl, reason }: { source: string | null; site: string; unsubscribeUrl: string; reason: string }): RenderedEmail {
  const c = welcomeCopy(source)
  return {
    subject: c.subject,
    html: layout({
      preheader: c.paras[0], heading: c.heading,
      body: [paragraphsHtml(c.paras), button(`${site}/shop`, c.cta)].join('\n'),
      footer: subscriberFooter({ reason, unsubscribeUrl }),
    }),
    text: [c.heading, '', ...c.paras.flatMap((t) => [t, '']), `${c.cta}: ${site}/shop`, '', `You’re getting this because ${reason}.`, `Unsubscribe: ${unsubscribeUrl}`].join('\n'),
  }
}
