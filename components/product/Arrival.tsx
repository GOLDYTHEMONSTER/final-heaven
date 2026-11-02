'use client'

import { useEffect, useState } from 'react'
import { FiClock } from 'react-icons/fi'
import { addDays, arrivesBy, shortDay } from '@/lib/delivery'
import { storeToday, type Product } from '@/lib/catalog'
import { zonedMidnight } from '@/lib/launch'
import { useLaunch } from '@/lib/useLaunch'

const ZONE = 'Africa/Lagos'

/**
 * When an order placed now should arrive, and until when that holds. Once
 * checkout is open, an order counts from today, so the date moves on at
 * midnight (store time): that midnight is the deadline. Before launch, orders
 * count from launch day, and the deadline is the moment checkout opens. Null
 * while the launch state loads, without a launch day, or when it can't be
 * worked out.
 */
export function useArrival(product: Pick<Product, 'fulfilment' | 'sourceType' | 'leadTimeDays' | 'purchase'>, tick = 0) {
  const launch = useLaunch()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    if (!tick) return
    const t = window.setInterval(() => setNow(Date.now()), tick)
    return () => window.clearInterval(t)
  }, [tick])
  if (!launch || now == null || !product.purchase) return null
  const today = storeToday(ZONE, new Date(now))
  const orderDay = launch.open ? today : launch.opensOn
  const by = arrivesBy(product, product.purchase, orderDay)
  if (!by) return null
  const deadline = launch.open ? zonedMidnight(addDays(today, 1), ZONE).getTime() : launch.opensAt ? new Date(launch.opensAt).getTime() : null
  return { by, open: launch.open, left: deadline == null ? null : Math.max(0, deadline - now) }
}

/** "4d 23h", "3h 12m", "45m": how long is left, to the minute. */
export function timeLeft(ms: number) {
  const m = Math.max(1, Math.floor(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m % 60}m`
  return `${m}m`
}

/** The product card's delivery badge text: "Get it by Sat 28 Nov", or null to keep the old wording. */
export function useCardArrival(product: Product) {
  const a = useArrival(product)
  return a ? `Get it by ${shortDay(a.by)}` : null
}

/**
 * Above the buy button: "Order within 3h 12m to get it by Sat 28 Nov". Before
 * launch: "Checkout opens in 4d 23h. Order then to get it by Sat 28 Nov."
 * Nothing for pre-orders (their date doesn't move) or when it can't be worked out.
 */
export function OrderCountdown({ product }: { product: Product }) {
  const a = useArrival(product, 15_000)
  if (!a || a.left == null || product.purchase?.state === 'preorder') return null
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-final-ember/40 bg-final-ember/10 px-3.5 py-3 text-sm text-final-off-white" aria-live="off">
      <FiClock className="mt-0.5 h-4 w-4 shrink-0 text-final-ember" aria-hidden />
      {a.open ? (
        <span>Order within <strong className="tabular-nums text-final-ember">{timeLeft(a.left)}</strong> to get it by <strong>{shortDay(a.by)}</strong>.</span>
      ) : (
        <span>Checkout opens in <strong className="tabular-nums text-final-ember">{timeLeft(a.left)}</strong>. Order then to get it by <strong>{shortDay(a.by)}</strong>.</span>
      )}
    </p>
  )
}
