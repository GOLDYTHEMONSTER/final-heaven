import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactLine, Detail, LegalPage, Section } from '@/components/legal/LegalPage'
import { BUSINESS, POLICY } from '@/lib/legal'

export const metadata: Metadata = { title: 'Terms of Sale - Final Heaven' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Sale" current="/terms"
      intro="These terms apply when you buy from Final Heaven. Please read them before placing an order.">
      <Section title="Who we are">
        <p>
          Final Heaven is operated by <Detail value={BUSINESS.legalName} label="registered business name" />,
          registered with the Corporate Affairs Commission under number <Detail value={BUSINESS.registrationNumber} label="CAC number" />,
          at <Detail value={BUSINESS.address} label="business address" />. To contact us, <ContactLine />.
        </p>
      </Section>

      <Section title="Your order">
        <ul>
          <li>When you place an order you are offering to buy the items in your cart at the prices shown.</li>
          <li>Your order is accepted once your payment is verified. Track Order then shows it as Confirmed.</li>
          <li>We may decline an order, for example if an item has sold out, a price was shown in error or we suspect fraud. If you have already paid, we refund you in full.</li>
          <li>Orders that are never paid may be cancelled.</li>
        </ul>
      </Section>

      <Section title="Prices and payment">
        <ul>
          <li>Prices are in Nigerian Naira (₦). The price that applies is the one shown when you place your order.</li>
          <li>Any delivery charge is shown at checkout before you pay.</li>
          <li>Payments are processed securely by Flutterwave. We never see or store your card details.</li>
          <li>Coming back from the payment page does not by itself confirm payment. We confirm it with Flutterwave before your order is accepted.</li>
        </ul>
      </Section>

      <Section title="Limited runs">
        <p>Many pieces are made in small quantities. If an item turns out to be unavailable after you have paid, we tell you and refund that item in full.</p>
      </Section>

      <Section title="Delivery">
        <p>We deliver within {POLICY.shipsTo} only. Delivery details are in our <Link href="/shipping">Shipping information</Link>. Items are your responsibility once they are delivered to the address you gave us.</p>
      </Section>

      <Section title="Returns and refunds">
        <p>You can return most items within {POLICY.returnWindowDays} days of delivery if you change your mind, and faulty or wrong items at any reasonable time. See our <Link href="/returns">Returns &amp; Refunds policy</Link>.</p>
      </Section>

      <Section title="Your legal rights">
        <p>Nothing in these terms affects your rights under the Federal Competition and Consumer Protection Act 2018 or any other law that protects consumers in Nigeria. If these terms conflict with those rights, your rights prevail.</p>
      </Section>

      <Section title="Product information">
        <p>We describe and photograph products as accurately as we can. Colours can look slightly different on different screens. If an item you receive does not match its description, it counts as a wrong item under our returns policy.</p>
      </Section>

      <Section title="Your order details">
        <p>Anyone with your order number and email address can see your order status on Track Order. Keep them private.</p>
      </Section>

      <Section title="Our responsibility to you">
        <ul>
          <li>If we break these terms, we are responsible for loss you suffer that was a foreseeable result.</li>
          <li>We are not responsible for business losses, or for losses that were not foreseeable when you ordered.</li>
          <li>We do not exclude or limit liability where the law does not allow it, including for death or personal injury caused by our negligence, or for fraud.</li>
        </ul>
      </Section>

      <Section title="Our content">
        <p>The Final Heaven name, logo, designs, photos and text on this site belong to us or our licensors. Please don’t reuse them without permission.</p>
      </Section>

      <Section title="Changes to these terms">
        <p>We may update these terms. The version in force when you place an order applies to that order; we record which version you accepted.</p>
      </Section>

      <Section title="Disputes">
        <p>
          These terms are governed by the laws of {BUSINESS.governingLaw}. If something goes wrong, please contact us first and we’ll try to put it right.
          You can also contact the Federal Competition and Consumer Protection Commission, and the courts of Nigeria have jurisdiction.
        </p>
      </Section>
    </LegalPage>
  )
}
