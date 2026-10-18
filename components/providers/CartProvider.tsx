'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useCartStore } from '@/lib/stores/cartStore'
import { track } from '@/lib/analytics'

interface CartContextType {
  items: any[]
  addItem: (item: any) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  total: number
  itemCount: number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCartStore()

  // Memoize computed values to prevent unnecessary re-renders
  const contextValue = {
    items: cart.items,
    // Every add-to-cart in the store goes through here, so it is tracked once.
    addItem: (item: any) => {
      cart.addItem(item)
      track('add_to_cart', { productId: item?.id })
    },
    removeItem: cart.removeItem,
    updateQuantity: cart.updateQuantity,
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