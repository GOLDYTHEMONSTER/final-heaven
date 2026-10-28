import { FiTruck, FiZap } from 'react-icons/fi'
import { arrivalText, type ProductDelivery } from '@/lib/delivery'
import { formatCurrency } from '@/lib/utils/format'

/** "Get it …" on the product page: when standard delivery arrives, and Express by air for pieces from China. */
export function DeliveryEstimate({ delivery }: { delivery: ProductDelivery }) {
  const { standard, express, expressFromKobo } = delivery
  return (
    <div className="space-y-3 rounded-lg border border-final-light-gray/30 p-4 text-sm">
      <div className="flex gap-3">
        <FiTruck className="mt-0.5 h-4 w-4 shrink-0 text-final-accent" aria-hidden />
        <p className="text-final-off-white">
          <span className="font-semibold">Get it {arrivalText(standard)}</span>
          <span className="block text-final-off-white/60">Free delivery</span>
        </p>
      </div>
      {express && expressFromKobo != null && (
        <div className="flex gap-3">
          <FiZap className="mt-0.5 h-4 w-4 shrink-0 text-final-accent" aria-hidden />
          <p className="text-final-off-white">
            <span className="font-semibold">Express by air: {arrivalText(express)}</span>
            <span className="block text-final-off-white/60">From {formatCurrency(expressFromKobo / 100)}, priced by weight. Choose it at checkout.</span>
          </p>
        </div>
      )}
    </div>
  )
}
