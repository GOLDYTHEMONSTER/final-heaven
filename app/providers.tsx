'use client'

import { ReactNode } from 'react'
import { CartProvider } from '@/components/providers/CartProvider'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <CartProvider>
      {children}
    </CartProvider>
  )
} 