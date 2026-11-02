// The staff daily digest: one email to STAFF_ALERT_EMAIL summarising the last
// 24 hours, so the owner doesn't have to open the Studio to know whether
// anything needs them. Pure (data in, email out); ./digest-store.ts gathers it.
import { BUSINESS } from '@/lib/legal'
import { AUDIENCES, isAudience } from './campaign'
import { C, button, escapeHtml, formatMoney, layout, p, type RenderedEmail } from './templates'

/** A product is "low" at or under this many left (made-to-order pieces have no stock to run out of). */
export const LOW_STOCK_AT = 2

export type DigestData = {
  /** Orders paid in the window. total is a sum in one currency. */
  paid: { count: number; total: number; currency: string }
  messages: number
  /** New sign-ups by list source. */
  subscribers: Record<string, number>
  lowStock: { id: string; name: string; stock: number }[]
  /** Outbox emails that failed or were skipped in the window, with the commonest reasons. */
  emailsFailed: number
  emailsSkipped: number
  emailProblems: { reason: string; count: number }[]
  bounces: number
  complaints: number
  /** Marketing emails held in Studio → Outbox, waiting for the owner. */
  heldBatches?: number
  /** Event tickets sold in the window (lib/events): tickets, and what their orders took. */
  tickets?: { count: number; total: number }
}

export function digestIsEmpty(d: DigestData): boolean {
  return d.paid.count === 0 && d.messages === 0 && Object.values(d.subscribers).every((n) => n === 0)
    && d.lowStock.length === 0 && d.emailsFailed === 0 && d.emailsSkipped === 0 && d.bounces === 0 && d.complaints === 0 && !d.heldBatches
    && !d.tickets?.count
}

const listName = (source: string) => (isAudience(source) ? AUDIENCES[source].label : source)

/** Reasons grouped and counted, most common first, for the failed/skipped line. */
export function topReasons(reasons: (string | null)[], max = 3): { reason: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of reasons) {
    const key = (r ?? 'no reason recorded').replace(/\s+/g, ' ').slice(0, 120)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, max)
}

export function staffDigestEmail(d: DigestData, { site, day }: { site: string; day: string }): RenderedEmail {
  const lines: { label: string; value: string; tone?: 'warn' }[] = []
  lines.push({ label: 'Paid orders', value: d.paid.count ? `${d.paid.count} · ${formatMoney(d.paid.total, d.paid.currency)}` : '0' })
  if (d.tickets?.count) lines.push({ label: 'Tickets sold', value: `${d.tickets.count} · ${formatMoney(d.tickets.total, d.paid.currency)}` })
  lines.push({ label: 'New messages', value: String(d.messages) })
  const subs = Object.entries(d.subscribers).filter(([, n]) => n > 0)
  lines.push({ label: 'New subscribers', value: subs.length ? subs.map(([s, n]) => `${listName(s)} ${n}`).join(', ') : '0' })
  lines.push({ label: 'Emails failed / skipped', value: `${d.emailsFailed} / ${d.emailsSkipped}`, tone: d.emailsFailed ? 'warn' : undefined })
  if (d.heldBatches) lines.push({ label: 'Emails waiting for your OK', value: `${d.heldBatches} (Studio → Outbox)`, tone: 'warn' })
  lines.push({ label: 'Bounces / complaints', value: `${d.bounces} / ${d.complaints}`, tone: d.bounces || d.complaints ? 'warn' : undefined })

  const rows = lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.line};color:${C.muted};width:48%;">${escapeHtml(l.label)}</td>
<td style="padding:8px 0;border-bottom:1px solid ${C.line};color:${l.tone === 'warn' ? C.ember : C.ink};font-weight:600;">${escapeHtml(l.value)}</td></tr>`).join('\n')
  const low = d.lowStock.length
    ? `<h2 style="margin:6px 0 8px;font-size:14px;color:${C.ink};">Low stock (${LOW_STOCK_AT} or fewer left)</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;">
${d.lowStock.map((x) => `<tr><td style="padding:6px 0;color:${C.body};"><a href="${escapeHtml(`${site}/product/${encodeURIComponent(x.id)}`)}" style="color:${C.ink};">${escapeHtml(x.name)}</a></td><td style="padding:6px 0;text-align:right;color:${x.stock === 0 ? C.ember : C.ink};font-weight:600;">${x.stock === 0 ? 'Sold out' : `${x.stock} left`}</td></tr>`).join('\n')}
</table>` : ''
  const why = d.emailProblems.length
    ? p(`<span style="font-size:13px;color:${C.muted};">Why emails were held back: ${d.emailProblems.map((x) => `${escapeHtml(x.reason)} (${x.count})`).join('; ')}.</span>`)
    : ''

  return {
    subject: `Daily digest, ${day}${d.paid.count ? `: ${d.paid.count} paid order${d.paid.count === 1 ? '' : 's'}` : ''}`,
    html: layout({
      preheader: `The last 24 hours at ${BUSINESS.tradingName}.`,
      heading: 'The last 24 hours',
      body: [
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;">${rows}</table>`,
        low, why,
        button(`${site}/studio`, 'Open the Studio'),
      ].join('\n'),
      footer: `Sent once a day to the store's alert address (STAFF_ALERT_EMAIL). It's skipped on days when nothing happened.<br>${escapeHtml(BUSINESS.tradingName)}`,
    }),
    text: [
      `The last 24 hours (${day})`, '',
      ...lines.map((l) => `${l.label}: ${l.value}`),
      ...(d.lowStock.length ? ['', `Low stock (${LOW_STOCK_AT} or fewer left):`, ...d.lowStock.map((x) => `- ${x.name}: ${x.stock === 0 ? 'sold out' : `${x.stock} left`}`)] : []),
      ...(d.emailProblems.length ? ['', `Why emails were held back: ${d.emailProblems.map((x) => `${x.reason} (${x.count})`).join('; ')}`] : []),
      '', `Studio: ${site}/studio`,
    ].join('\n'),
  }
}
