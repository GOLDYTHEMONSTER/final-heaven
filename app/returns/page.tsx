import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactLine, LegalPage, Section } from '@/components/legal/LegalPage'
import { POLICY } from '@/lib/legal'

export const metadata: Metadata = { title: 'Returns & Refunds - Final Heaven' }

export default function ReturnsPage() {
  const customerPays = POLICY.changeOfMindReturnShipping === 'customer'
  return (
    <LegalPage title="Returns & Refunds" current="/returns"
      intro={`Changed your mind? You have ${POLICY.returnWindowDays} days from delivery to return it. Something wrong with your order? We’ll put it right.`}>
      <Section title="Changed your mind">
        <ul>
          <li>Tell us within {POLICY.returnWindowDays} days of delivery that you want to return an item.</li>
          <li>It must be unworn, unwashed and undamaged, with its tags attached and in its original packaging.</li>
          <li>{customerPays ? 'You pay for return delivery, and the item is your responsibility until it reaches us. Use a tracked service.' : 'Return delivery is free.'}</li>
          <li>Once it arrives and we’ve checked it, we refund the price you paid for the item.</li>
        </ul>
      </Section>

      <Section title="Faulty, damaged or wrong items">
        <ul>
          <li>Please tell us within {POLICY.faultReportDays} days of delivery, with photos, so we can sort it out quickly.</li>
          <li>We cover the cost of returning it and of sending a replacement.</li>
          <li>You can choose a repair, a replacement (if we still have one) or a full refund.</li>
          <li>This doesn’t limit your rights under the Federal Competition and Consumer Protection Act 2018, which protect you if goods are defective or not as described even after these time limits.</li>
        </ul>
      </Section>

      <Section title="Items we can’t take back">
        <ul>
          <li>Items that have been worn, washed or damaged after delivery.</li>
          <li>Items clearly marked as final sale on the product page.</li>
        </ul>
        <p>This doesn’t affect your rights for faulty or wrong items.</p>
      </Section>

      <Section title="How to start a return">
        <ol className="ml-5 list-decimal space-y-2">
          <li>Contact us: <ContactLine />. Include your order number, the item and the reason.</li>
          <li>We’ll reply with the return address and what to do next. Please don’t send anything back before we’ve replied.</li>
          <li>Pack the item securely and keep your proof of postage.</li>
        </ol>
      </Section>

      <Section title="Refunds">
        <ul>
          <li>We refund to the payment method you used, through Flutterwave.</li>
          <li>We issue the refund within {POLICY.refundProcessingDays} business days of receiving and checking your return, and email you when we do. Your bank may take a few more days to show it.</li>
        </ul>
      </Section>

      <Section title="Exchanges">
        <p>Our pieces are made in limited runs, so a different size may already be sold out. The quickest route is to return the item for a refund and place a new order.</p>
      </Section>

      <Section title="Cancelling an order">
        <p>Contact us before your order ships and we’ll cancel it and refund you in full. Once it has shipped, use the return process above. You can check your order’s status on <Link href="/track-order">Track Order</Link>.</p>
      </Section>
    </LegalPage>
  )
}
