import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactLine, LegalPage, Section } from '@/components/legal/LegalPage'
import { POLICY } from '@/lib/legal'
import { DELIVERY } from '@/lib/delivery'
import { formatCurrency } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Shipping - Final Heaven' }

export default function ShippingPage() {
  return (
    <LegalPage title="Shipping" current="/shipping" intro={`We deliver within ${POLICY.shipsTo}.`}>
      <Section title="Where we deliver">
        <p>Anywhere in {POLICY.shipsTo}. We don’t ship outside {POLICY.shipsTo} at the moment.</p>
      </Section>

      <Section title="Delivery times">
        <ul>
          <li>In stock: {DELIVERY.inStock.min}–{DELIVERY.inStock.max} days after your payment is verified.</li>
          <li>Made to order: the making time shown on the product, then {DELIVERY.inStock.min}–{DELIVERY.inStock.max} days.</li>
          <li>Ordered in from China: {DELIVERY.fromChina.min}–{DELIVERY.fromChina.max} days with standard delivery, or {DELIVERY.expressFromChina.min}–{DELIVERY.expressFromChina.max} days with Express by air.</li>
          <li>Pre-orders: {DELIVERY.inStock.min}–{DELIVERY.inStock.max} days after the ship date shown on the product.</li>
        </ul>
        <p>The product page and checkout show the dates to expect. An order travels together, so it arrives with its slowest item. These are estimates: courier or customs delays can move them, and we’ll tell you if they do.</p>
      </Section>

      <Section title="Delivery charges">
        <p>Standard delivery is free. Any delivery charge is shown at checkout before you pay. If checkout doesn’t show one, there is nothing more to pay for delivery.</p>
        <p>Express by air is offered when your order includes items ordered in from China. It costs {formatCurrency(DELIVERY.expressBaseKobo / 100)} for the first {DELIVERY.expressIncludedKg} kg of those items and {formatCurrency(DELIVERY.expressPerExtraKgKobo / 100)} for each further kg or part of one, based on their packed weight.</p>
      </Section>

      <Section title="When your order ships">
        <ul>
          <li>We start preparing your order once your payment is verified.</li>
          <li>When it ships, the courier’s name and tracking reference appear on <Link href="/track-order">Track Order</Link>. Use your order number and the email you ordered with.</li>
        </ul>
      </Section>

      <Section title="If something goes wrong">
        <ul>
          <li>If your parcel arrives damaged, or doesn’t arrive, contact us within {POLICY.faultReportDays} days of the expected delivery date and we’ll investigate with the courier.</li>
          <li>Please double-check your delivery address at checkout. If you spot a mistake, contact us straight away, before the order ships.</li>
        </ul>
        <p>To reach us, <ContactLine topic="order" />.</p>
      </Section>
    </LegalPage>
  )
}
