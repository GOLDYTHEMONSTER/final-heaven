import type { Metadata } from 'next'
import Link from 'next/link'
import { Detail, LegalPage, Section } from '@/components/legal/LegalPage'
import { BUSINESS } from '@/lib/legal'

export const metadata: Metadata = { title: 'Contact - Final Heaven' }

export default function ContactPage() {
  return (
    <LegalPage title="Contact" current="/contact" intro="Questions about an order, a return or your data? Get in touch.">
      <Section title="Get in touch">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-final-muted">Email</dt><dd className="mt-1"><Detail value={BUSINESS.email} label="support email" /></dd></div>
          <div><dt className="text-sm text-final-muted">Phone</dt><dd className="mt-1"><Detail value={BUSINESS.phone} label="support phone" /></dd></div>
          <div className="sm:col-span-2"><dt className="text-sm text-final-muted">Address</dt><dd className="mt-1"><Detail value={BUSINESS.address} label="business address" /></dd></div>
        </dl>
        <p>Please include your order number if your message is about an order.</p>
      </Section>

      <Section title="Quick answers">
        <ul>
          <li>Where’s my order? Check <Link href="/track-order">Track Order</Link> with your order number and email.</li>
          <li>Returns and refunds: see our <Link href="/returns">Returns &amp; Refunds policy</Link>.</li>
          <li>Your personal data: see our <Link href="/privacy">Privacy Policy</Link>.</li>
        </ul>
      </Section>

      <Section title="Business details">
        <p>
          Final Heaven is operated by <Detail value={BUSINESS.legalName} label="registered business name" />,
          CAC registration <Detail value={BUSINESS.registrationNumber} label="CAC number" />.
        </p>
      </Section>
    </LegalPage>
  )
}
