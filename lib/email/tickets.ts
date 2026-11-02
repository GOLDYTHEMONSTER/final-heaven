// The ticket email (service mail: the buyer paid and expects it). Pure, like
// templates.ts. Each ticket's QR code is a PNG from /api/tickets/<token>/qr,
// because Gmail doesn't show SVG; the button opens all of them on the site.
import { BUSINESS } from '@/lib/legal'
import { eventWhen, showCode, ticketsUrl } from '@/lib/events'
import { C, button, customerFooter, detailRows, escapeHtml, formatMoney, layout, p, type RenderedEmail } from './templates'

export type TicketEmailData = {
  email: string
  name: string
  orderNumber: string
  accessToken: string
  total: number | string
  currency: string
  status: 'confirmed' | 'cancelled'
  event: { title: string; startsAt: string; venue: string; address: string }
  tickets: { token: string; code: string; type: string }[]
  timeZone: string
}

export function ticketsEmail(t: TicketEmailData, site: string): RenderedEmail {
  const n = t.tickets.length
  const when = eventWhen(t.event.startsAt, t.timeZone)
  const where = [t.event.venue, t.event.address].filter(Boolean).join(', ')
  const link = ticketsUrl(site, t.accessToken)
  const subject = `Your ${n === 1 ? 'ticket' : `${n} tickets`}: ${t.event.title}`.slice(0, 80)

  const cards = t.tickets.map((k, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid ${C.line};border-radius:12px;background:${C.card};">
<tr><td style="padding:16px;text-align:center;">
<p style="margin:0 0 10px;font-size:13px;color:${C.muted};">${escapeHtml(k.type)}${n > 1 ? ` · ${i + 1} of ${n}` : ''}</p>
<img src="${escapeHtml(`${site}/api/tickets/${k.token}/qr`)}" width="200" height="200" alt="QR code for ticket ${escapeHtml(showCode(k.code))}" style="display:block;margin:0 auto;border-radius:8px;background:#ffffff;">
<p style="margin:12px 0 0;font-family:monospace;font-size:22px;letter-spacing:4px;color:${C.ink};">${escapeHtml(showCode(k.code))}</p>
</td></tr></table>`).join('\n')

  const html = layout({
    preheader: `${when}${where ? ` · ${where}` : ''}. Show the QR code at the door.`,
    heading: n === 1 ? 'Here’s your ticket.' : 'Here are your tickets.',
    body: [
      p(`Hi ${escapeHtml(t.name)}, you’re going to <strong>${escapeHtml(t.event.title)}</strong>.`),
      detailRows([['When', when], ['Where', where || null], ['Order', t.orderNumber], ['Paid', formatMoney(t.total, t.currency)]]),
      button(link, n === 1 ? 'Open your ticket' : 'Open your tickets'),
      cards,
      p(`<span style="font-size:13px;color:${C.muted};">Each QR code lets one person in, once. Give each guest their own ticket and don’t post them online. If a code won’t scan, read out the code under it.</span>`),
    ].join('\n'),
    footer: customerFooter(site),
  })
  const text = [
    n === 1 ? 'Here’s your ticket.' : 'Here are your tickets.',
    '',
    `Hi ${t.name}, you’re going to ${t.event.title}.`,
    `When: ${when}`,
    ...(where ? [`Where: ${where}`] : []),
    `Order: ${t.orderNumber}`,
    `Paid: ${formatMoney(t.total, t.currency)}`,
    '',
    `Open your ${n === 1 ? 'ticket' : 'tickets'}: ${link}`,
    '',
    ...t.tickets.map((k, i) => `${k.type}${n > 1 ? ` (${i + 1} of ${n})` : ''}: ${showCode(k.code)}`),
    '',
    'Each QR code lets one person in, once. If a code won’t scan, read out the code instead.',
    '',
    BUSINESS.tradingName,
  ].join('\n')
  return { subject, html, text }
}
