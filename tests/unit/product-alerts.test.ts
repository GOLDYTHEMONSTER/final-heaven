// Which alerts are ready to send, the email, and the outbox sending it. Nothing is sent.
import { describe, expect, it, vi } from 'vitest'
import { readyAlerts } from '@/lib/email/alerts'
import { productAvailableEmail } from '@/lib/email/lifecycle'
import { deliverQueuedEmails, type AlertEmailData, type EmailDeps, type EmailStore, type FinishResult, type OutboxRow } from '@/lib/email/outbox'

const TODAY = '2026-11-10'
const base = { status: 'active', category: 'Tees', members_only: false, purchases_paused: false, preorder: false, release_date: null }

describe('which alerts are ready', () => {
  const ready = (product: Record<string, unknown> | null, hidden: string[] = []) =>
    readyAlerts([{ id: 'a1', product: product as never }], TODAY, hidden)

  it('sends when the product can now be bought: in stock, or open for pre-order', () => {
    expect(ready({ ...base, stock: 3 })).toEqual(['a1'])
    expect(ready({ ...base, stock: 0, preorder: true, preorder_ships_on: '2026-12-01', preorder_limit: 5 })).toEqual(['a1'])
  })

  it('keeps waiting while it is sold out, not released yet, members only, paused or not on sale', () => {
    expect(ready({ ...base, stock: 0 })).toEqual([])
    expect(ready({ ...base, stock: 5, release_date: '2026-11-20' })).toEqual([])
    expect(ready({ ...base, stock: 5, members_only: true })).toEqual([])
    expect(ready({ ...base, stock: 5, purchases_paused: true })).toEqual([])
    expect(ready({ ...base, stock: 5, status: 'draft' })).toEqual([])
    expect(ready({ ...base, stock: 0, preorder: true, preorder_ships_on: '2026-12-01', preorder_limit: 0 })).toEqual([])
  })

  it('a release date that has arrived counts, and hidden categories and missing products never do', () => {
    expect(ready({ ...base, stock: 5, release_date: '2026-11-10' })).toEqual(['a1'])
    expect(ready({ ...base, stock: 5 }, ['Tees'])).toEqual([])
    expect(ready(null)).toEqual([])
  })
})

describe('the alert email', () => {
  const product = { id: 'p1', name: 'Iced <Ghost>', price: 25000, image: '/images/p1.jpg', shipsOn: null }
  const e = productAvailableEmail({ product, site: 'https://s.test', unsubscribeUrl: 'https://s.test/unsubscribe?token=T' })

  it('links to the product, escapes its name and offers to cancel the request', () => {
    expect(e.html).toContain('https://s.test/product/p1')
    expect(e.html).toContain('Iced &lt;Ghost&gt;')
    expect(e.html).toContain('neon-mark.gif')
    expect(e.text).toContain('Cancel the request: https://s.test/unsubscribe?token=T')
    expect(e.subject).toBe('Iced <Ghost> is available')
  })

  it('says pre-order, with the ship date, for a pre-order', () => {
    const pre = productAvailableEmail({ product: { ...product, shipsOn: '2026-12-01' }, site: 'https://s.test', unsubscribeUrl: 'u' })
    expect(pre.text).toMatch(/Pre-order now/)
    expect(pre.text).toMatch(/ships from/)
  })
})

describe('outbox sends product.available', () => {
  const row: OutboxRow = { id: 1, tenantId: 't1', kind: 'product.available', orderId: null, messageId: null, subscriberId: null, alertId: 'a1', dedupeKey: 'product.available:a1', attempts: 1 }
  const alert: AlertEmailData = { email: 'ada@x.test', unsubscribeToken: 'tok', product: { id: 'p1', name: 'Ghost', price: 100, image: null, shipsOn: null }, buyable: true }
  function run(a: AlertEmailData | null) {
    const finished: FinishResult[] = []
    const send = vi.fn(async () => ({ id: 'em_a' }))
    const store = { claim: async () => [row], loadAlert: async () => a, suppressed: async () => false, finish: async (_i: number, r: FinishResult) => { finished.push(r) } } as unknown as EmailStore
    const deps: EmailDeps = { store, sender: { send }, log: () => {}, pauseMs: 0, config: { from: 'FH <a@x.test>', replyTo: null, staffTo: [], siteUrl: 'https://s.test' } }
    return { deps, send, finished }
  }

  it('sends it once with the one-click unsubscribe header', async () => {
    const r = run(alert)
    expect(await deliverQueuedEmails(r.deps)).toMatchObject({ sent: 1 })
    expect((r.send.mock.calls[0] as unknown as [{ headers: Record<string, string> }])[0].headers['List-Unsubscribe']).toBe('<https://s.test/api/newsletter/unsubscribe?token=tok>')
  })

  it('skips if the alert was cancelled, the product is gone, or it sold out again', async () => {
    for (const a of [null, { ...alert, product: null }, { ...alert, buyable: false }]) {
      const r = run(a)
      expect(await deliverQueuedEmails(r.deps)).toMatchObject({ skipped: 1, sent: 0 })
      expect(r.send).not.toHaveBeenCalled()
    }
  })
})
