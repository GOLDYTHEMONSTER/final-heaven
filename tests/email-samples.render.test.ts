// Renders sample emails (the store's real templates) to files for
// scripts/email-test.mjs. Not a test: it runs only when EMAIL_RENDER_OUT is set,
// via `npx vitest run tests/email-samples.render.test.ts`.
import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { orderPaidEmail, orderShippedEmail, type OrderEmailData } from '@/lib/email/templates'
import { renderCampaign } from '@/lib/email/campaign'
import { welcomeEmail } from '@/lib/email/lifecycle'
import { inviteLink } from '@/lib/early-access'
import { ticketsEmail } from '@/lib/email/tickets'

const out = process.env.EMAIL_RENDER_OUT

it.skipIf(!out)('renders sample emails', () => {
  const site = 'https://www.finalheaven.shop'
  const order: OrderEmailData = {
    orderNumber: 'FH-TEST1', email: 'test@example.com', subtotal: 25000, discount: 0, total: 27500, currency: 'NGN',
    deliveryOption: 'express', deliveryFee: 2500,
    deliveryEstimate: { minDays: 10, maxDays: 17, from: null, to: null },
    items: [{ name: 'Striped Track Pants', quantity: 1, size: 'L', color: 'Black', price: 25000, madeToOrderDays: 14 }],
    trackingNumber: 'TRK-TEST1', shippingCity: 'Lagos', shippingState: 'Lagos',
    shippingCarrier: 'GIG Logistics', shippingReference: 'GIG123456', status: 'shipped',
  }
  const campaign = renderCampaign({
    subject: 'Final Heaven opens in November', preheader: 'You signed up early, so you hear it first.',
    heading: 'Doors open in November',
    body: 'You signed up early, so you hear it first.\n\nDrop 01 lands the day the doors open. Here’s a first look.',
    ctaLabel: 'See Drop 01', ctaUrl: '/drop-01',
  }, { site, unsubscribeUrl: `${site}/unsubscribe`, reason: 'this is a test', products: [
    { id: 'p1793210836554', name: 'Striped Track Pants', price: 25000, image: null },
    { id: 'p1793275911791', name: 'Water Blaster — Shark 43 cm', price: 10500, image: null },
  ] })
  // The welcome a launch-waitlist sign-up gets before checkout opens, with a sample early access code.
  const welcomeEarly = welcomeEmail({ source: 'launch_waitlist', site, unsubscribeUrl: `${site}/unsubscribe`, reason: 'this is a test',
    early: { code: 'FHTEST01', percent: 25, inviteLink: inviteLink(site, 'FHTEST01') } })
  // A two-ticket order for a sample launch event. Its QR images point at made-up tokens, so they won't load.
  const tickets = ticketsEmail({
    email: 'test@example.com', name: 'Test Buyer', orderNumber: 'FHT-TEST01', accessToken: '0'.repeat(32), total: '45000.00', currency: 'NGN',
    status: 'confirmed', timeZone: 'Africa/Lagos',
    event: { title: 'Final Heaven Launch Night', startsAt: '2026-11-21T19:00:00Z', venue: 'Sample venue', address: 'Lagos' },
    tickets: [{ token: '1'.repeat(32), code: 'k7m42q', type: 'VIP' }, { token: '2'.repeat(32), code: 'p3x9zt', type: 'Regular' }],
  }, site)
  mkdirSync(out!, { recursive: true })
  for (const [name, e] of Object.entries({ campaign, 'order-paid': orderPaidEmail(order, site), 'order-shipped': orderShippedEmail(order, site), 'welcome-early': welcomeEarly, tickets })) {
    writeFileSync(join(out!, `${name}.json`), JSON.stringify(e))
  }
})
