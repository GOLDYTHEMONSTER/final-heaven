import type { Metadata } from 'next'
import { Detail, LegalPage, Section } from '@/components/legal/LegalPage'
import { BUSINESS, RETENTION } from '@/lib/legal'

export const metadata: Metadata = { title: 'Privacy Policy - Final Heaven' }

const rows: [string, string, string][] = [
  ['Orders', 'Your email, delivery address, the items you bought and your order history', 'To process and deliver your order and handle returns (contract); to keep records the law requires (legal obligation)'],
  ['Payments', 'Payment status, amount and reference from Flutterwave. Never your card details', 'To confirm you paid and to reconcile our accounts (contract, legal obligation)'],
  ['Newsletter', 'Your email and a record of the consent you gave', 'To send you drop alerts and offers (your consent, which you can withdraw at any time)'],
  ['Visit statistics', 'Pages and products viewed, cart and checkout steps, the referring website, campaign tags, device type and country', 'To understand how the shop is used and improve it (legitimate interests). This is anonymous: see below'],
  ['Security', 'A scrambled (hashed) form of your IP address, used to limit repeated requests and kept for up to 2 days', 'To protect the shop from abuse and fraud (legitimate interests)'],
]

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" current="/privacy"
      intro="This policy explains what personal data we collect, why, and the rights you have under the Nigeria Data Protection Act 2023.">
      <Section title="Who is responsible for your data">
        <p>
          <Detail value={BUSINESS.legalName} label="registered business name" />, trading as Final Heaven, at <Detail value={BUSINESS.address} label="business address" />,
          is responsible for your personal data. For any privacy question or request, contact <Detail value={BUSINESS.privacyContact ?? BUSINESS.email} label="privacy contact" />.
        </p>
      </Section>

      <Section title="What we collect and why">
        <div className="overflow-x-auto rounded-lg border border-final-off-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-final-gray text-final-muted">
              <tr><th className="p-3 font-medium">When</th><th className="p-3 font-medium">What</th><th className="p-3 font-medium">Why, and our legal basis</th></tr>
            </thead>
            <tbody className="divide-y divide-final-off-white/10">
              {rows.map(([a, b, c]) => <tr key={a}><td className="p-3 align-top font-medium">{a}</td><td className="p-3 align-top">{b}</td><td className="p-3 align-top">{c}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p>You don’t need an account to shop with us, and we don’t ask for more than we need to deliver your order.</p>
      </Section>

      <Section title="Anonymous visit statistics">
        <ul>
          <li>We use no analytics or advertising cookies and store nothing on your device for statistics.</li>
          <li>To count visitors, your IP address and browser details are combined with a random key and turned into a code. The key changes every day and the old one is destroyed, so the code can’t be linked to you or to your visits on other days. Your IP address and browser details are not stored.</li>
          <li>If your browser sends a Do Not Track or Global Privacy Control signal, you are not counted at all.</li>
        </ul>
      </Section>

      <Section title="Cookies and storage on your device">
        <ul>
          <li>Your cart is saved in your browser’s local storage so it’s still there when you come back. It stays on your device until you check out.</li>
          <li>Staff who sign in to manage the shop get a sign-in cookie. Shoppers don’t.</li>
          <li>Because we only use what’s strictly necessary for the shop to work, we don’t show a cookie banner.</li>
        </ul>
      </Section>

      <Section title="Who we share it with">
        <ul>
          <li><strong>Flutterwave</strong>, to process your payment.</li>
          <li><strong>Supabase</strong>, which hosts our database. Our data is stored on its servers in the European Union (Germany).</li>
          <li><strong>Vercel</strong>, which hosts the website.</li>
          <li><strong>Our delivery partners</strong>, who receive your delivery address and order details to deliver your order.</li>
        </ul>
        <p>We don’t sell your data or share it for advertising. These providers process data only on our instructions. Where data is handled outside Nigeria, we rely on the safeguards the Nigeria Data Protection Act requires, such as the providers’ contractual protections.</p>
      </Section>

      <Section title="How long we keep it">
        <ul>
          <li>Orders and payment records: {RETENTION.ordersAndPayments}.</li>
          <li>Newsletter subscription: {RETENTION.newsletter}.</li>
          <li>Visit statistics: {RETENTION.analytics}.</li>
          <li>Abuse protection data: {RETENTION.abuseProtection}.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>Under the Nigeria Data Protection Act 2023 you can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you and give you a copy</li>
          <li>correct data that is wrong</li>
          <li>delete your data, where we don’t need to keep it by law</li>
          <li>restrict or object to how we use it, including for marketing</li>
          <li>send your data to you or another organisation in a common format</li>
          <li>withdraw your consent at any time, for example by unsubscribing from emails</li>
        </ul>
        <p>Contact <Detail value={BUSINESS.privacyContact ?? BUSINESS.email} label="privacy contact" /> with your order number so we can find your records. We’ll reply promptly and within the time the law requires. We may ask you to confirm it’s you before we act.</p>
        <p>If you’re unhappy with how we’ve handled your data, you can complain to the Nigeria Data Protection Commission (ndpc.gov.ng).</p>
      </Section>

      <Section title="Children">
        <p>Our shop is for adults. If you are under 18, please shop with a parent or guardian.</p>
      </Section>

      <Section title="Keeping your data safe">
        <p>Data is encrypted in transit, staff only see what their role needs, sensitive actions are logged, and payments are handled by Flutterwave rather than on our servers.</p>
      </Section>

      <Section title="Changes">
        <p>If we change this policy we’ll update the date at the top. If a change materially affects how we use your data, we’ll tell you before it applies.</p>
      </Section>
    </LegalPage>
  )
}
