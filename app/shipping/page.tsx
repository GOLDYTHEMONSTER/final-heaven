import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactLine, LegalPage, Section } from '@/components/legal/LegalPage'
import { POLICY } from '@/lib/legal'

export const metadata: Metadata = { title: 'Shipping - Final Heaven' }

export default function ShippingPage() {
  return (
    <LegalPage title="Shipping" current="/shipping" intro={`We deliver within ${POLICY.shipsTo}.`}>
      <Section title="Where we deliver">
        <p>Anywhere in {POLICY.shipsTo}. We don’t ship outside {POLICY.shipsTo} at the moment.</p>
      </Section>

      <Section title="Delivery charges">
        <p>Any delivery charge is shown at checkout before you pay. If checkout doesn’t show one, there is nothing more to pay for delivery.</p>
      </Section>

      <Section title="When your order ships">
        <ul>
          <li>We start preparing your order once your payment is verified.</li>
          <li>When it ships, the courier’s name and tracking reference appear on <Link href="/track-order">Track Order</Link>. Use your order number and the email you ordered with.</li>
          <li>Delivery time depends on your location and the courier.</li>
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
