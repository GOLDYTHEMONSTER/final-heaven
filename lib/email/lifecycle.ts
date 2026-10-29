// Automatic customer emails beyond receipts: welcome, checkout reminder, back
// in stock, delivered follow-up. Pure and rendered through layout() like every
// other email, so they match the store and can be unit-tested. Everything that
// came from a customer or the catalogue is escaped by the helpers below.
import { BUSINESS, POLICY } from '@/lib/legal'
import { LAUNCH_WINDOW, formatDay } from '@/lib/catalog'
import { sized } from '@/lib/images'
import { C, button, customerFooter, escapeHtml, formatMoney, itemDetails, layout, lineAmount, p, type OrderEmailData, type RenderedEmail } from './templates'

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

// ---------------------------------------------------------------------------
// Back in stock / drop alert
// ---------------------------------------------------------------------------

export type AlertProduct = { id: string; name: string; price: number; image: string | null; shipsOn: string | null }

/** The one email an alert sends. `image` is absolute or a site path; `unsubscribeUrl` removes just this alert. */
export function productAvailableEmail({ product, site, unsubscribeUrl }: { product: AlertProduct; site: string; unsubscribeUrl: string }): RenderedEmail {
  const url = `${site}/product/${encodeURIComponent(product.id)}`
  const img = product.image ? (product.image.startsWith('/') ? `${site}${sized(product.image, 640)}` : sized(product.image, 640)) : null
  const line = product.shipsOn
    ? `${product.name} is open for pre-order now. Pay to reserve yours; it ships from ${formatDay(product.shipsOn)}.`
    : `${product.name} is available now. Pieces like this can go fast, so we’re telling you first.`
  return {
    subject: `${product.name} is available`.replace(/[\r\n]+/g, ' '),
    html: layout({
      preheader: `You asked us to tell you when ${product.name} is available.`,
      heading: 'It’s here',
      body: [
        p(escapeHtml(line)),
        `<a href="${escapeHtml(url)}" style="text-decoration:none;color:${C.ink};display:block;margin:4px 0 18px;">
${img ? `<img src="${escapeHtml(img)}" width="320" alt="${escapeHtml(product.name)}" style="display:block;width:100%;max-width:320px;height:auto;border-radius:6px;background:${C.paper};">` : ''}
<div style="padding:8px 2px 0;font-size:14px;color:${C.ink};">${escapeHtml(product.name)}</div>
<div style="padding:2px 2px 0;font-size:14px;font-weight:700;color:${C.ink};">${escapeHtml(formatMoney(product.price, 'NGN'))}</div>
</a>`,
        button(url, product.shipsOn ? 'Pre-order now' : 'Get it now'),
      ].join('\n'),
      footer: [
        `You’re getting this once because you asked to be told when ${escapeHtml(product.name)} is available. It’s the only email this request will send.`,
        `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.muted};">Cancel the request</a> if you no longer want it.`,
        `${escapeHtml(BUSINESS.tradingName)} · ${escapeHtml(POLICY.shipsTo)}`,
      ].join('<br>'),
    }),
    text: [
      'It’s here', '', line, '', `${product.name}, ${formatMoney(product.price, 'NGN')}`, `${product.shipsOn ? 'Pre-order now' : 'Get it now'}: ${url}`, '',
      `You’re getting this once because you asked to be told when ${product.name} is available.`, `Cancel the request: ${unsubscribeUrl}`,
    ].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Delivered: "How's it fitting?"
// ---------------------------------------------------------------------------

/** Days after delivery the follow-up goes out, and how far back the daily job looks (so a first run doesn't email old orders). */
export const FOLLOWUP_AFTER_DAYS = 3
export const FOLLOWUP_WITHIN_DAYS = 14
export const FOLLOWUP_DAILY_CAP = 30

/** One email per delivered order: its pieces, each linking to its page, where they can Hype it. No reviews are collected. */
export function orderFollowupEmail(o: Pick<OrderEmailData, 'orderNumber' | 'items'>, site: string): RenderedEmail {
  const pieces = o.items.filter((i) => i.productId && !i.gift)
  const intro = `Order ${o.orderNumber} arrived a few days ago. We hope it’s everything you wanted.`
  const hype = 'Open a piece below and tap Hype on its page: it tells us, and everyone else, what’s worth wearing.'
  const link = (i: OrderEmailData['items'][number]) => `${site}/product/${encodeURIComponent(i.productId!)}`
  const returns = `Something not right? You have ${POLICY.returnWindowDays} days from delivery to return it: ${site}/returns`
  return {
    subject: 'How’s it fitting?',
    html: layout({
      preheader: `Order ${o.orderNumber} has been with you a few days. How is it?`,
      heading: 'How’s it fitting?',
      body: [
        p(escapeHtml(intro)),
        pieces.length ? p(escapeHtml(hype)) : '',
        pieces.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;">
${pieces.map((i) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.ink};">${escapeHtml(i.name)}${itemDetails(i) ? `<br><span style="color:${C.muted};font-size:12px;">${escapeHtml(itemDetails(i))}</span>` : ''}</td>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};text-align:right;white-space:nowrap;vertical-align:top;"><a href="${escapeHtml(link(i))}" style="color:${C.ink};font-weight:700;">Open</a></td></tr>`).join('\n')}
</table>` : button(`${site}/shop`, 'Back to the shop'),
        p(`<span style="font-size:13px;color:${C.muted};">Something not right? You have ${POLICY.returnWindowDays} days from delivery to return it. See our <a href="${escapeHtml(site)}/returns" style="color:${C.muted};">returns policy</a>, or just reply to this email.</span>`),
      ].join('\n'),
      footer: customerFooter(site),
    }),
    text: [
      'How’s it fitting?', '', intro, '', ...(pieces.length ? [hype, '', ...pieces.map((i) => `- ${i.name}: ${link(i)}`), ''] : []), returns,
    ].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Unfinished checkout
// ---------------------------------------------------------------------------

export type ReminderItem = Parameters<typeof itemDetails>[0]

/** Only ever sent as a scheduled email, written when the checkout begins: so it always says what to do if they've already paid. */
export function checkoutReminderEmail({ items, currency, total, site }: { items: ReminderItem[]; currency: string; total: number | string; site: string }): RenderedEmail {
  const link = `${site}/checkout`
  const rows = items.map((i) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.ink};">${escapeHtml(i.name)}${itemDetails(i) ? `<br><span style="color:${C.muted};font-size:12px;">${escapeHtml(itemDetails(i))}</span>` : ''}</td>
<td style="padding:10px 12px;border-bottom:1px solid ${C.line};color:${C.muted};text-align:center;white-space:nowrap;vertical-align:top;">× ${escapeHtml(i.quantity)}</td>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.ink};text-align:right;white-space:nowrap;vertical-align:top;">${escapeHtml(lineAmount(i, currency))}</td>
</tr>`).join('\n')
  const intro = 'You started checking out at Final Heaven and didn’t finish. Your pieces are below, if you still want them.'
  const ignore = 'If you’ve already paid, ignore this email: your order is placed and you’ll get a receipt.'
  return {
    subject: 'Still thinking it over?',
    html: layout({
      preheader: 'Your Final Heaven checkout is waiting.',
      heading: 'You left something behind',
      body: [
        p(escapeHtml(intro)),
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;">
${rows}
<tr><td colspan="2" style="padding:12px 0 0;color:${C.ink};font-weight:700;">Total</td>
<td style="padding:12px 0 0;color:${C.ink};font-weight:700;text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(total, currency))}</td></tr>
</table>`,
        button(link, 'Back to checkout'),
        p(`<span style="font-size:13px;color:${C.muted};">${escapeHtml(ignore)} Prices and availability are confirmed again at checkout.</span>`),
      ].join('\n'),
      footer: [
        'You’re getting this once because you started a checkout at Final Heaven. We won’t send another reminder for it.',
        `${escapeHtml(BUSINESS.tradingName)} · ${escapeHtml(POLICY.shipsTo)}`,
      ].join('<br>'),
    }),
    text: [
      'You left something behind', '', intro, '',
      ...items.map((i) => `- ${i.name}${itemDetails(i) ? ` (${itemDetails(i)})` : ''} × ${i.quantity}  ${lineAmount(i, currency)}`),
      `Total: ${formatMoney(total, currency)}`, '', `Back to checkout: ${link}`, '', ignore,
    ].join('\n'),
  }
}
