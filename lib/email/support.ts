// Support emails to the customer: the acknowledgement when the contact form is
// sent, and staff's reply from Studio → Messages. Pure and rendered through
// layout() like every other email. The customer's message and the staff
// member's reply are both free text, so both are escaped.
import { SUPPORT_REPLY_TIME, replySubject } from '@/lib/support'
import { C, TOPICS, button, customerFooter, detailRows, escapeHtml, layout, p, type MessageEmailData, type RenderedEmail } from './templates'

const quote = (text: string) =>
  `<div style="margin:0 0 20px;padding:12px 16px;border-left:3px solid ${C.line};font-size:13px;line-height:1.6;color:${C.muted};white-space:pre-wrap;">${escapeHtml(text)}</div>`

/** "We've got your message", with the reference to quote and when to expect an answer. */
export function supportAckEmail(m: MessageEmailData, site: string): RenderedEmail {
  const topic = TOPICS[m.topic] ?? TOPICS.other
  const subject = `We’ve got your message${m.reference ? ` [${m.reference}]` : ''}`
  const html = layout({
    preheader: `${m.reference ? `Your reference is ${m.reference}. ` : ''}You’ll hear from us ${SUPPORT_REPLY_TIME}.`,
    heading: 'We’ve got your message',
    body: [
      p(`Hi ${escapeHtml(m.name.trim().split(/\s+/)[0] || 'there')}, thanks for writing to us. A person reads every message, and you’ll hear back ${escapeHtml(SUPPORT_REPLY_TIME)}.`),
      detailRows([['Reference', m.reference ?? null], ['Topic', topic], ['Order', m.orderNumber]]),
      quote(m.message),
      p(`<span style="font-size:13px;color:${C.muted};">Reply to this email to add anything. Where an order is concerned, you can also check it any time on the tracking page.</span>`),
      button(`${site}/track-order${m.orderNumber ? `?orderNumber=${encodeURIComponent(m.orderNumber)}` : ''}`, 'Track an order'),
    ].join('\n'),
    footer: customerFooter(site),
  })
  const text = [
    'We’ve got your message',
    '',
    `Hi ${m.name.trim().split(/\s+/)[0] || 'there'}, thanks for writing to us. A person reads every message, and you’ll hear back ${SUPPORT_REPLY_TIME}.`,
    '',
    ...(m.reference ? [`Reference: ${m.reference}`] : []),
    `Topic: ${topic}`,
    ...(m.orderNumber ? [`Order: ${m.orderNumber}`] : []),
    '',
    ...m.message.split('\n').map((l) => `> ${l}`),
    '',
    'Reply to this email to add anything.',
    `Track an order: ${site}/track-order`,
  ].join('\n')
  return { subject, html, text }
}

/** A staff reply, threaded under the customer's message by its subject. */
export function supportReplyEmail(m: MessageEmailData, body: string, site: string): RenderedEmail {
  const topic = TOPICS[m.topic] ?? TOPICS.other
  const html = layout({
    preheader: body.replace(/\s+/g, ' ').slice(0, 120),
    heading: 'Our reply',
    body: [
      `<div style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${C.body};white-space:pre-wrap;">${escapeHtml(body)}</div>`,
      `<div style="margin:0 0 6px;font-size:12px;color:${C.muted};">Your message${m.reference ? ` (${escapeHtml(m.reference)})` : ''}</div>`,
      quote(m.message),
    ].join('\n'),
    footer: customerFooter(site),
  })
  const text = [
    body,
    '',
    '--',
    `Your message${m.reference ? ` (${m.reference})` : ''}:`,
    ...m.message.split('\n').map((l) => `> ${l}`),
  ].join('\n')
  return { subject: replySubject(topic, m.reference ?? null), html, text }
}
