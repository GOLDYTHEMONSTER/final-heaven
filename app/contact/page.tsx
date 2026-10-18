import type { Metadata } from 'next'
import Link from 'next/link'
import { BusinessIdentity, LegalPage, Section } from '@/components/legal/LegalPage'
import { ContactForm } from '@/components/legal/ContactForm'
import { BUSINESS } from '@/lib/legal'

export const metadata: Metadata = { title: 'Contact - Final Heaven' }

const TOPICS = ['order', 'return', 'privacy', 'other']

export default function ContactPage({ searchParams }: { searchParams: { topic?: string } }) {
  const topic = TOPICS.includes(searchParams.topic ?? '') ? searchParams.topic : 'order'
  const direct = [
    BUSINESS.email && { label: 'Email', value: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> },
    BUSINESS.phone && { label: 'Phone', value: BUSINESS.phone },
    BUSINESS.address && { label: 'Address', value: BUSINESS.address },
  ].filter(Boolean) as { label: string; value: React.ReactNode }[]

  return (
    <LegalPage title="Contact" current="/contact" intro="Questions about an order, a return or your data? Send us a message and we’ll reply by email.">
      <Section title="Send us a message">
        <ContactForm defaultTopic={topic} />
      </Section>

      {direct.length > 0 && (
        <Section title="Other ways to reach us">
          <dl className="grid gap-4 sm:grid-cols-2">
            {direct.map((d) => (
              <div key={d.label}><dt className="text-sm text-final-muted">{d.label}</dt><dd className="mt-1">{d.value}</dd></div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Quick answers">
        <ul>
          <li>Where’s my order? Check <Link href="/track-order">Track Order</Link> with your order number and email.</li>
          <li>Returns and refunds: see our <Link href="/returns">Returns &amp; Refunds policy</Link>.</li>
          <li>Your personal data: see our <Link href="/privacy">Privacy Policy</Link>.</li>
        </ul>
      </Section>

      <Section title="About us">
        <p><BusinessIdentity /></p>
      </Section>
    </LegalPage>
  )
}
