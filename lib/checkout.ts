import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BadRequest, int, text } from '@/lib/api'
import { storeToday } from '@/lib/catalog'
import { quoteCart, type CartLine, type PromoContext, type PromoCode } from '@/lib/orders'
import type { StoreContext } from '@/lib/tenancy'

const MAX_LINES = 50
const MAX_QUANTITY = 20

export const PRODUCT_COLUMNS =
  'id, name, price, original_price, stock, status, images, category, members_only, release_date, preorder, preorder_ships_on, preorder_limit, sizes, colors'

export function parseItems(value: unknown): CartLine[] {
  if (!Array.isArray(value) || value.length === 0) throw new BadRequest('Your cart is empty.')
  if (value.length > MAX_LINES) throw new BadRequest(`Orders are limited to ${MAX_LINES} lines.`)

  // Merge duplicate product/size/colour lines so quantity limits can't be dodged.
  const merged = new Map<string, CartLine>()
  for (const raw of value) {
    const item = (raw ?? {}) as Record<string, unknown>
    const id = text(item.id, 'Item id', { max: 100, required: true })!
    const size = text(item.size, 'Size', { max: 20 })
    const color = text(item.color, 'Colour', { max: 40 })
    const quantity = int(item.quantity, 'Quantity', { min: 1, max: MAX_QUANTITY })
    const key = `${id}::${size ?? ''}::${color ?? ''}`
    const line = merged.get(key) ?? { id, size, color, quantity: 0 }
    line.quantity += quantity
    if (line.quantity > MAX_QUANTITY) throw new BadRequest(`You can order up to ${MAX_QUANTITY} of each item.`)
    merged.set(key, line)
  }
  return [...merged.values()]
}

export function parsePromoCode(value: unknown): string | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!code) return null
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new BadRequest('That promo code isn’t valid.')
  return code
}

/** A promo code with its usage on paid orders (overall, and by this customer if known). */
export async function loadPromo(db: SupabaseClient, tenantId: string, code: string, email: string | null): Promise<PromoContext | null> {
  const { data: promo, error } = await db.from('promo_codes')
    .select('id, code, description, kind, value, min_subtotal, starts_at, ends_at, max_uses, once_per_customer, active')
    .eq('tenant_id', tenantId).eq('code', code).maybeSingle()
  if (error) throw error
  if (!promo) return null
  const paid = ['paid', 'partially_refunded', 'refunded']
  const uses = await db.from('orders').select('id', { head: true, count: 'exact' })
    .eq('tenant_id', tenantId).eq('promo_code_id', promo.id).in('payment_status', paid)
  if (uses.error) throw uses.error
  let customerUses = 0
  if (email) {
    const mine = await db.from('orders').select('id', { head: true, count: 'exact' })
      .eq('tenant_id', tenantId).eq('promo_code_id', promo.id).in('payment_status', paid).ilike('email', email.replace(/[%_]/g, ''))
    if (mine.error) throw mine.error
    customerUses = mine.count ?? 0
  }
  return { promo: promo as PromoCode, uses: uses.count ?? 0, customerUses }
}

/** The authoritative quote for a cart in this store. */
export async function quoteForStore(db: SupabaseClient, store: StoreContext,
  { lines, promoCode, email }: { lines: CartLine[]; promoCode: string | null; email: string | null }) {
  const { data: products, error } = await db.from('products').select(PRODUCT_COLUMNS)
    .eq('store_id', store.storeId).in('id', [...new Set(lines.map((l) => l.id))])
  if (error) throw error
  // Hidden categories can't be bought even by calling the API directly.
  const available = (products ?? []).filter((p) => !store.hiddenCategories.includes(p.category))
  const promo = promoCode ? await loadPromo(db, store.tenantId, promoCode, email) : null
  return {
    products: available,
    promo,
    options: { today: storeToday(store.timeZone), promo, promoCode },
    quote: quoteCart(lines, available, store.currency, { today: storeToday(store.timeZone), promo, promoCode }),
  }
}
