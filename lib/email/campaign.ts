// Campaign emails (Studio → Campaigns): what staff write, rendered the way
// subscribers get it. Pure, so the Studio preview, the test send and the real
// send are the same email, and it can be unit-tested. Everything staff type is
// HTML-escaped; links are only https:// or the store's own paths.
import { BUSINESS, POLICY } from '@/lib/legal'
import { sized } from '@/lib/images'
import { C, button, escapeHtml, formatMoney, layout, p, type RenderedEmail } from './templates'

/** The lists a campaign can go to: the sources sign-ups record (app/api/newsletter). */
export const AUDIENCES = {
  launch_waitlist: { label: 'Launch waitlist', reason: 'you joined the Final Heaven waitlist' },
  membership_waitlist: { label: 'Membership waitlist', reason: 'you joined the Final Heaven membership waitlist' },
  footer: { label: 'Newsletter', reason: 'you signed up for Final Heaven emails' },
} as const
export type Audience = keyof typeof AUDIENCES
export const isAudience = (v: unknown): v is Audience => typeof v === 'string' && v in AUDIENCES

export const LIMITS = { subject: 150, preheader: 150, heading: 120, body: 5000, ctaLabel: 40, ctaUrl: 500, products: 6 }

export type CampaignContent = {
  subject: string
  preheader: string
  heading: string
  body: string
  ctaLabel: string | null
  ctaUrl: string | null
}

/** A product card as the email shows it (from the public catalogue). */
export type CampaignProduct = { id: string; name: string; price: number; image: string | null }

/** Absolute https link for a staff-entered URL or store path; null if it isn't one. */
export function campaignLink(url: string | null, site: string): string | null {
  if (!url) return null
  if (url.startsWith('/')) return `${site}${url}`
  return /^https:\/\/[^\s"'<>]+$/.test(url) ? url : null
}

/** What's missing before a campaign can be sent (empty when it's ready). */
export function campaignProblems(c: CampaignContent & { audience: string[] }, site = 'https://example.com'): string[] {
  const out: string[] = []
  if (!c.subject.trim()) out.push('Add a subject.')
  if (!c.heading.trim()) out.push('Add a heading.')
  if (!c.body.trim()) out.push('Write the message.')
  if (!c.audience.length) out.push('Choose who it goes to.')
  if (Boolean(c.ctaLabel?.trim()) !== Boolean(c.ctaUrl?.trim())) out.push('A button needs both its words and its link.')
  else if (c.ctaUrl && !campaignLink(c.ctaUrl, site)) out.push('The button link must start with https:// or / (a page on this site).')
  return out
}

/** Plain text, paragraphs split on blank lines, single line breaks kept. */
const paragraphs = (body: string) => body.replace(/\r\n/g, '\n').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)

function productCards(products: CampaignProduct[], site: string) {
  if (!products.length) return ''
  const cell = (pr: CampaignProduct) => {
    const href = `${site}/product/${encodeURIComponent(pr.id)}`
    const img = pr.image ? (pr.image.startsWith('/') ? `${site}${sized(pr.image, 640)}` : sized(pr.image, 640)) : null
    return `<td width="50%" valign="top" style="padding:6px;">
<a href="${escapeHtml(href)}" style="text-decoration:none;color:${C.ink};">
${img ? `<img src="${escapeHtml(img)}" width="234" alt="${escapeHtml(pr.name)}" style="display:block;width:100%;max-width:234px;height:auto;border-radius:6px;background:${C.paper};">` : ''}
<div style="padding:8px 2px 0;font-size:14px;line-height:1.35;color:${C.ink};">${escapeHtml(pr.name)}</div>
<div style="padding:2px 2px 0;font-size:14px;font-weight:700;color:${C.ink};">${escapeHtml(formatMoney(pr.price, 'NGN'))}</div>
</a></td>`
  }
  const rows: string[] = []
  for (let i = 0; i < products.length; i += 2) {
    rows.push(`<tr>${cell(products[i])}${products[i + 1] ? cell(products[i + 1]) : '<td width="50%"></td>'}</tr>`)
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px -6px 18px;">${rows.join('\n')}</table>`
}

/**
 * The email one subscriber receives. `reason` says why they're getting it
 * (from the list they joined); `unsubscribeUrl` is their own one-click link.
 */
export function renderCampaign(c: CampaignContent, opts: { products: CampaignProduct[]; site: string; unsubscribeUrl: string; reason: string }): RenderedEmail {
  const { site, unsubscribeUrl, reason, products } = opts
  const cta = c.ctaLabel?.trim() ? campaignLink(c.ctaUrl, site) : null
  const body = [
    ...paragraphs(c.body).map((para) => p(escapeHtml(para).replace(/\n/g, '<br>'))),
    productCards(products, site),
    cta ? button(cta, c.ctaLabel!.trim()) : '',
  ].join('\n')
  const footer = [
    `You’re getting this because ${escapeHtml(reason)}.`,
    `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.muted};">Unsubscribe</a> any time, in one click.`,
    `${escapeHtml(BUSINESS.tradingName)}${BUSINESS.address ? ` · ${escapeHtml(BUSINESS.address)}` : ''} · ${escapeHtml(POLICY.shipsTo)}`,
  ].join('<br>')
  const text = [
    c.heading.trim(), '',
    ...paragraphs(c.body).flatMap((para) => [para, '']),
    ...products.map((pr) => `${pr.name}, ${formatMoney(pr.price, 'NGN')}: ${site}/product/${pr.id}`),
    ...(products.length ? [''] : []),
    ...(cta ? [`${c.ctaLabel!.trim()}: ${cta}`, ''] : []),
    `You’re getting this because ${reason}.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n')
  return {
    subject: c.subject.replace(/[\r\n]+/g, ' ').trim(),
    html: layout({ preheader: c.preheader || c.heading, heading: c.heading, body, footer }),
    text,
  }
}
