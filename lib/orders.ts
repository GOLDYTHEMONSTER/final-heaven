// Order pricing, kept pure so it can be tested without a database.
import { BadRequest } from '@/lib/api'
import { toMinor } from '@/lib/money'

export type CartLine = { id: string; size: string | null; quantity: number }
export type CatalogueProduct = { id: string; name: string; price: number | string; stock: number | null; status: string; images: unknown }

export type PricedOrder = {
  items: { id: string; name: string; price: number; quantity: number; size: string | null; image: string | null }[]
  subtotalMinor: number
  totalMinor: number
}

/**
 * Authoritative totals from catalogue prices. The browser's prices and totals
 * are never read. Integer minor units throughout, so no floating-point drift.
 */
export function priceOrder(lines: CartLine[], products: CatalogueProduct[], currency: string): PricedOrder {
  const byId = new Map(products.map((p) => [p.id, p]))
  const quantityById = new Map<string, number>()
  for (const l of lines) quantityById.set(l.id, (quantityById.get(l.id) ?? 0) + l.quantity)

  let subtotalMinor = 0
  const items = lines.map((line) => {
    const product = byId.get(line.id)
    if (!product || product.status !== 'active') {
      throw new BadRequest('An item in your cart is no longer available. Please review your cart.')
    }
    if (typeof product.stock === 'number' && quantityById.get(line.id)! > product.stock) {
      throw new BadRequest(`Only ${product.stock} left of ${product.name}.`)
    }
    const unitMinor = toMinor(product.price, currency)
    subtotalMinor += unitMinor * line.quantity
    const images = Array.isArray(product.images) ? (product.images as { url?: string }[]) : []
    return {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      quantity: line.quantity,
      size: line.size,
      image: images[0]?.url ?? null,
    }
  })
  // Shipping, discounts and tax will be added here, server-side, in Phase 2.
  return { items, subtotalMinor, totalMinor: subtotalMinor }
}
