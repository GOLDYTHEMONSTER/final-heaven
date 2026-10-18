import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// The cart is a wish list kept in the browser: the server prices it (see
// /api/checkout/quote) and only those prices are ever charged.
export interface CartItem {
  id: string
  name: string
  price: number
  image: string
  size: string | null
  color?: string | null
  quantity: number
  isMembersOnly?: boolean
}

/** One cart line per product, size and colour. */
export const lineKey = (i: Pick<CartItem, 'id' | 'size' | 'color'>) => `${i.id}::${i.size ?? ''}::${i.color ?? ''}`

interface CartStore {
  items: CartItem[]
  promoCode: string
  addItem: (item: CartItem) => void
  removeItem: (key: string) => void
  updateQuantity: (key: string, quantity: number) => void
  setPromoCode: (code: string) => void
  clearCart: () => void
  getTotal: () => number
  getItemCount: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      promoCode: '',
      addItem: (item) => {
        const { items } = get()
        const key = lineKey(item)
        if (items.some((i) => lineKey(i) === key)) {
          set({ items: items.map((i) => (lineKey(i) === key ? { ...i, quantity: Math.min(20, i.quantity + item.quantity) } : i)) })
        } else {
          set({ items: [...items, item] })
        }
      },
      removeItem: (key) => set({ items: get().items.filter((i) => lineKey(i) !== key) }),
      updateQuantity: (key, quantity) =>
        set({ items: get().items.map((i) => (lineKey(i) === key ? { ...i, quantity: Math.max(1, Math.min(20, quantity)) } : i)) }),
      setPromoCode: (code) => set({ promoCode: code.trim().toUpperCase() }),
      clearCart: () => set({ items: [], promoCode: '' }),
      getTotal: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: 'final-heaven-cart',
      // Only persist items and the promo code, not computed values
      partialize: (state) => ({ items: state.items, promoCode: state.promoCode }),
    }
  )
)
