'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useCartStore, type CartItem } from '@/lib/stores/cartStore'
import { track } from '@/lib/analytics'

interface CartContextType {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (key: string) => void
  updateQuantity: (key: string, quantity: number) => void
  promoCode: string
  setPromoCode: (code: string) => void
  clearCart: () => void
  total: number
  itemCount: number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCartStore()

  const contextValue = {
    items: cart.items,
    // Every add-to-cart in the store goes through here, so it is tracked once.
    addItem: (item: CartItem) => {
      cart.addItem(item)
      track('add_to_cart', { productId: item?.id })
    },
    removeItem: cart.removeItem,
    updateQuantity: cart.updateQuantity,
    promoCode: cart.promoCode,
    setPromoCode: cart.setPromoCode,
    clearCart: cart.clearCart,
    total: cart.getTotal(),
    itemCount: cart.getItemCount(),
  }

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
