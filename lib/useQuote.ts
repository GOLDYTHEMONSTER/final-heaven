'use client'

import { useEffect, useState } from 'react'
import type { CartItem } from '@/lib/stores/cartStore'
import type { PaymentsState } from '@/lib/catalog'

/** Where /checkout/complete finds the checkout to retry if the payment doesn't go through. */
export const PENDING_CHECKOUT_KEY = 'fh-pending-checkout'

export type ServerQuote = {
  currency: string
  lines: {
    id: string; name: string; size: string | null; color: string | null; quantity: number
    unitPrice: string; lineTotal: string; preorder: boolean; shipsOn: string | null; issue: string | null
  }[]
  subtotal: string
  discount: string
  total: string
  isPreorder: boolean
  promo: { code: string; description: string | null } | null
  promoError: string | null
  ok: boolean
  /** Whether checkout takes payments now (launch day, store pause). */
  payments: PaymentsState
}

/**
 * The server's price for the cart, refreshed whenever the cart or promo code
 * changes. The browser's own prices are only a fallback while this loads.
 */
export function useQuote(items: CartItem[], promoCode: string, email?: string) {
  const [quote, setQuote] = useState<ServerQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The email only matters for "one use per customer" promo codes, so it's
  // sent (and re-priced on) only when a code is applied and the address looks
  // complete, not on every keystroke.
  const promoEmail = promoCode && email && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim()) ? email.trim() : null
  const payload = JSON.stringify({
    items: items.map((i) => ({ id: i.id, size: i.size ?? null, color: i.color ?? null, quantity: i.quantity })),
    promoCode: promoCode || null,
    email: promoEmail,
  })

  useEffect(() => {
    if (!items.length) {
      setQuote(null)
      return
    }
    const controller = new AbortController()
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const timer = setTimeout(async () => {
      setLoading(true)
      // A busy moment (rate limit, network blip) is retried quietly before the customer sees an error.
      for (let attempt = 1; ; attempt++) {
        try {
          const res = await fetch('/api/checkout/quote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, signal: controller.signal,
          })
          const data = await res.json()
          // A newer request replaced this one mid-download: ignore whatever arrived.
          if (controller.signal.aborted) return
          if (!res.ok) throw new Error(data?.error || 'We couldn’t price your cart.')
          if (!Array.isArray(data?.lines)) throw new Error('We couldn’t price your cart.')
          setQuote(data)
          setError(null)
          setLoading(false)
          return
        } catch (e) {
          if (controller.signal.aborted) return // superseded; the newer request reports its own result
          if (attempt < 4) {
            await pause(1500 * attempt)
            if (controller.signal.aborted) return
            continue
          }
          setError((e as Error).message || 'We couldn’t price your cart.')
          setLoading(false)
          return
        }
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // payload captures everything that changes the price
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload])

  return { quote, loading, error }
}

/** The quote line for the cart item at `index` (the server answers in cart order; cart lines are unique). */
export const quoteLineAt = (quote: ServerQuote | null, items: CartItem[], index: number) =>
  quote && Array.isArray(quote.lines) && quote.lines.length === items.length && quote.lines[index]?.id === items[index]?.id ? quote.lines[index] : undefined
