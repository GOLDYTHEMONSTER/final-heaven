// Email content, kept pure so it can be tested without sending anything.
// Every value that came from a customer is HTML-escaped. Light layout with
// table markup and inline styles, which is what email clients render reliably.
import { BUSINESS, POLICY } from '@/lib/legal'
import { formatDay, optionLabel } from '@/lib/catalog'

export type OrderEmailData = {
  orderNumber: string
  email: string
  subtotal?: number | string
  discount?: number | string
  promoCode?: string | null
  total: number | string
  currency: string
  isPreorder?: boolean
  /** Lines the shop couldn't fully cover from stock when the order was paid. */
  stockShortfall?: { name: string; size: string | null; missing: number }[] | null
  items: { name: string; quantity: number; size: string | null; color?: string | null; price: number | string; preorder?: boolean; shipsOn?: string | null }[]
  trackingNumber: string
  shippingCity: string | null
  shippingState: string | null
  shippingCarrier: string | null
  shippingReference: string | null
  status: string
}

export type MessageEmailData = {
  name: string
  email: string
  topic: string
  orderNumber: string | null
  message: string
}

export type RenderedEmail = { subject: string; html: string; text: string }

const C = { ink: '#0a0a0b', body: '#2c2c30', muted: '#6b6b70', line: '#e4e3df', paper: '#f2f1ee', card: '#ffffff', ember: '#e8613c' }

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Subjects are single-line: newlines from customer input are collapsed. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

export function formatMoney(amount: number | string, currency: string) {
  const value = Number(amount)
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

const TOPICS: Record<string, string> = {
  order: 'About an order', return: 'Return or refund', privacy: 'Personal data request', other: 'General enquiry',
}

function layout({ preheader, heading, body, footer }: { preheader: string; heading: string; body: string; footer: string }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:8px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">
<tr><td style="background:${C.ink};padding:18px 28px;color:#f2f1ee;font-size:13px;font-weight:700;letter-spacing:3px;">FINAL HEAVEN</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${C.ink};">${escapeHtml(heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid ${C.line};color:${C.muted};font-size:12px;line-height:1.6;">${footer}</td></tr>
</table></td></tr></table></body></html>`
}

const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.body};">${html}</p>`

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr>
<td style="background:${C.ink};border-radius:6px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;color:#f2f1ee;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a></td>
</tr></table>`
}

function detailRows(rows: [string, string | null][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;">
${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 0;color:${C.muted};width:42%;">${escapeHtml(k)}</td><td style="padding:6px 0;color:${C.ink};font-weight:600;">${escapeHtml(v)}</td></tr>`).join('\n')}
</table>`
}

const shipDate = (d: string) => formatDay(d)
const itemDetails = (i: OrderEmailData['items'][number]) =>
  [i.size ? `Size ${i.size}` : null, i.color ? optionLabel(i.color) : null, i.preorder && i.shipsOn ? `Pre-order, ships from ${shipDate(i.shipsOn)}` : null]
    .filter(Boolean).join(' · ')

function itemsTable(o: OrderEmailData) {
  const discount = Number(o.discount ?? 0)
  const rows = o.items.map((i) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.ink};">${escapeHtml(i.name)}${itemDetails(i) ? `<br><span style="color:${C.muted};font-size:12px;">${escapeHtml(itemDetails(i))}</span>` : ''}</td>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.muted};text-align:center;white-space:nowrap;">× ${escapeHtml(i.quantity)}</td>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.ink};text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(Number(i.price) * i.quantity, o.currency))}</td>
</tr>`).join('\n')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;">
${rows}
${discount > 0 ? `<tr><td colspan="2" style="padding:12px 0 0;color:${C.muted};">Discount${o.promoCode ? ` (${escapeHtml(o.promoCode)})` : ''}</td>
<td style="padding:12px 0 0;color:${C.muted};text-align:right;white-space:nowrap;">-${escapeHtml(formatMoney(discount, o.currency))}</td></tr>` : ''}
<tr><td colspan="2" style="padding:12px 0 0;color:${C.ink};font-weight:700;">Total paid</td>
<td style="padding:12px 0 0;color:${C.ink};font-weight:700;text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(o.total, o.currency))}</td></tr>
</table>`
}

const itemsText = (o: OrderEmailData) => [
  ...o.items.map((i) => `- ${i.name}${itemDetails(i) ? ` (${itemDetails(i)})` : ''} × ${i.quantity}  ${formatMoney(Number(i.price) * i.quantity, o.currency)}`),
  ...(Number(o.discount ?? 0) > 0 ? [`Discount${o.promoCode ? ` (${o.promoCode})` : ''}: -${formatMoney(Number(o.discount), o.currency)}`] : []),
].join('\n')

function customerFooter(site: string) {
  const contact = BUSINESS.email
    ? `Questions? Reply to this email or write to ${escapeHtml(BUSINESS.email)}.`
    : `Questions? Reply to this email or use our <a href="${escapeHtml(site)}/contact" style="color:${C.muted};">contact form</a>.`
  return `${contact}<br>${escapeHtml(BUSINESS.tradingName)} · ${escapeHtml(POLICY.shipsTo)}`
}

const trackUrl = (site: string, orderNumber: string) => `${site}/track-order?orderNumber=${encodeURIComponent(orderNumber)}`

export function orderPaidEmail(o: OrderEmailData, site: string): RenderedEmail {
  const subject = `Order ${o.orderNumber} confirmed`
  const next = o.isPreorder
    ? 'Pre-order items ship from the date shown below. We\'ll email you when your order ships.'
    : 'We\'re getting it ready and will email you when it ships.'
  const html = layout({
    preheader: `We've received your payment of ${formatMoney(o.total, o.currency)}. Your order is placed.`,
    heading: 'Thank you. Your order is placed.',
    body: [
      p(`Your payment is confirmed and order <strong>${escapeHtml(o.orderNumber)}</strong> is placed. ${escapeHtml(next)}`),
      itemsTable(o),
      detailRows([
        ['Order number', o.orderNumber],
        ['Tracking number', o.trackingNumber],
        ['Delivering to', [o.shippingCity, o.shippingState].filter(Boolean).join(', ') || null],
      ]),
      button(trackUrl(site, o.orderNumber), 'Track your order'),
      p(`<span style="font-size:13px;color:${C.muted};">To track it, enter your order number and this email address. Returns are accepted within ${POLICY.returnWindowDays} days of delivery; see our <a href="${escapeHtml(site)}/returns" style="color:${C.muted};">returns policy</a>.</span>`),
    ].join('\n'),
    footer: customerFooter(site),
  })
  const text = [
    'Thank you. Your order is placed.',
    '',
    `Your payment is confirmed and order ${o.orderNumber} is placed. ${next}`,
    '',
    itemsText(o),
    `Total paid: ${formatMoney(o.total, o.currency)}`,
    '',
    `Order number: ${o.orderNumber}`,
    `Tracking number: ${o.trackingNumber}`,
    '',
    `Track your order: ${trackUrl(site, o.orderNumber)}`,
    `Returns are accepted within ${POLICY.returnWindowDays} days of delivery: ${site}/returns`,
    '',
    `${BUSINESS.tradingName}`,
  ].join('\n')
  return { subject, html, text }
}

export function orderShippedEmail(o: OrderEmailData, site: string): RenderedEmail {
  const subject = `Your order ${o.orderNumber} is on its way`
  const html = layout({
    preheader: o.shippingCarrier ? `Shipped with ${o.shippingCarrier}.` : 'Your order has left us.',
    heading: 'Your order is on its way.',
    body: [
      p(`Good news: order <strong>${escapeHtml(o.orderNumber)}</strong> has shipped.`),
      detailRows([
        ['Courier', o.shippingCarrier],
        ['Shipment reference', o.shippingReference],
        ['Tracking number', o.trackingNumber],
        ['Delivering to', [o.shippingCity, o.shippingState].filter(Boolean).join(', ') || null],
      ]),
      button(trackUrl(site, o.orderNumber), 'Track your order'),
    ].join('\n'),
    footer: customerFooter(site),
  })
  const text = [
    'Your order is on its way.',
    '',
    `Order ${o.orderNumber} has shipped.`,
    o.shippingCarrier ? `Courier: ${o.shippingCarrier}` : null,
    o.shippingReference ? `Shipment reference: ${o.shippingReference}` : null,
    `Tracking number: ${o.trackingNumber}`,
    '',
    `Track your order: ${trackUrl(site, o.orderNumber)}`,
    '',
    `${BUSINESS.tradingName}`,
  ].filter((l) => l !== null).join('\n')
  return { subject, html, text }
}

export function staffOrderPaidEmail(o: OrderEmailData, site: string): RenderedEmail {
  const cancelled = o.status === 'cancelled'
  const amount = formatMoney(o.total, o.currency)
  const subject = cancelled
    ? `Payment on cancelled order ${o.orderNumber}: refund needed`
    : o.stockShortfall?.length
      ? `New order ${o.orderNumber} · ${amount} · stock short`
      : `New order ${o.orderNumber} · ${amount}`
  const link = `${site}/admin/orders?q=${encodeURIComponent(o.orderNumber)}`
  const html = layout({
    preheader: `${amount}${o.shippingCity ? ` · ${o.shippingCity}` : ''}`,
    heading: cancelled ? 'A payment arrived for a cancelled order' : 'New paid order, ready to fulfil',
    body: [
      cancelled ? p(`<strong style="color:${C.ember};">This order was already cancelled.</strong> The customer has paid and needs a refund.`) : '',
      o.stockShortfall?.length ? p(`<strong style="color:${C.ember};">Stock ran short when this was paid:</strong> ${o.stockShortfall.map((l) => `${escapeHtml(l.name)}${l.size ? ` (${escapeHtml(l.size)})` : ''}: ${l.missing} missing`).join('; ')}. Restock, or contact the customer about a refund for the missing items.`) : '',
      o.isPreorder ? p('Includes pre-order items: ship them from their pre-order date.') : '',
      itemsTable(o),
      detailRows([
        ['Order number', o.orderNumber],
        ['Customer', o.email],
        ['Delivering to', [o.shippingCity, o.shippingState].filter(Boolean).join(', ') || null],
      ]),
      button(link, 'Open in admin'),
    ].join('\n'),
    footer: 'Sent to store staff by Final Heaven admin.',
  })
  const text = [
    cancelled ? 'A payment arrived for a cancelled order. The customer needs a refund.' : 'New paid order, ready to fulfil.',
    ...(o.stockShortfall?.length ? [`STOCK SHORT: ${o.stockShortfall.map((l) => `${l.name}${l.size ? ` (${l.size})` : ''}: ${l.missing} missing`).join('; ')}`] : []),
    ...(o.isPreorder ? ['Includes pre-order items.'] : []),
    '',
    itemsText(o),
    `Total paid: ${amount}`,
    `Order: ${o.orderNumber}`,
    `Customer: ${o.email}`,
    '',
    `Open in admin: ${link}`,
  ].join('\n')
  return { subject, html, text }
}

export function staffMessageEmail(m: MessageEmailData, site: string): RenderedEmail {
  const topic = TOPICS[m.topic] ?? TOPICS.other
  const subject = oneLine(`New message from ${m.name.slice(0, 60)}: ${topic}`)
  const html = layout({
    preheader: m.message.slice(0, 120),
    heading: `New message from ${m.name}`,
    body: [
      detailRows([
        ['From', `${m.name} <${m.email}>`],
        ['Topic', topic],
        ['Order', m.orderNumber],
      ]),
      `<div style="margin:0 0 20px;padding:14px 16px;background:${C.paper};border-radius:6px;font-size:14px;line-height:1.6;color:${C.ink};white-space:pre-wrap;">${escapeHtml(m.message)}</div>`,
      p('Reply to this email to answer the customer directly.'),
      button(`${site}/admin/messages`, 'Open messages'),
    ].join('\n'),
    footer: 'Sent to store staff by Final Heaven admin.',
  })
  const text = [
    `New message from ${m.name} <${m.email}>`,
    `Topic: ${topic}`,
    m.orderNumber ? `Order: ${m.orderNumber}` : null,
    '',
    m.message,
    '',
    'Reply to this email to answer the customer directly.',
    `Open messages: ${site}/admin/messages`,
  ].filter((l) => l !== null).join('\n')
  return { subject, html, text }
}
