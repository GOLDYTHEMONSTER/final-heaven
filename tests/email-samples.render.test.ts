// Renders sample emails (the store's real templates) to files for
// scripts/email-test.mjs. Not a test: it runs only when EMAIL_RENDER_OUT is set,
// via `npx vitest run tests/email-samples.render.test.ts`.
import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { orderPaidEmail, orderShippedEmail, type OrderEmailData } from '@/lib/email/templates'
import { renderCampaign } from '@/lib/email/campaign'

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
  mkdirSync(out!, { recursive: true })
  for (const [name, e] of Object.entries({ campaign, 'order-paid': orderPaidEmail(order, site), 'order-shipped': orderShippedEmail(order, site) })) {
    writeFileSync(join(out!, `${name}.json`), JSON.stringify(e))
  }
})
