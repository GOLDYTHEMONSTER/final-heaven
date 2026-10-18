import Link from 'next/link'
import { POLICY } from '@/lib/legal'

/** Short delivery and returns summary for product pages, from the same source as the full policies. */
export function PolicySummary() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h4 className="mb-3 font-semibold">Delivery</h4>
        <ul className="list-disc space-y-2 pl-5 text-final-muted">
          <li>We deliver within {POLICY.shipsTo} only.</li>
          <li>Any delivery charge is shown at checkout before you pay.</li>
          <li>Your courier and tracking reference appear on Track Order once it ships.</li>
        </ul>
        <Link href="/shipping" className="mt-3 inline-block text-sm underline underline-offset-4">Shipping information</Link>
      </div>
      <div>
        <h4 className="mb-3 font-semibold">Returns</h4>
        <ul className="list-disc space-y-2 pl-5 text-final-muted">
          <li>Change your mind within {POLICY.returnWindowDays} days of delivery.</li>
          <li>Items must be unworn and unwashed, with tags attached.</li>
          <li>
            {POLICY.changeOfMindReturnShipping === 'customer'
              ? 'You pay return delivery for change-of-mind returns.'
              : 'Return delivery is free.'}{' '}
            Faulty or wrong items are on us.
          </li>
        </ul>
        <Link href="/returns" className="mt-3 inline-block text-sm underline underline-offset-4">Returns policy</Link>
      </div>
    </div>
  )
}
