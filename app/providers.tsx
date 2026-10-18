'use client'

import { ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { CartProvider } from '@/components/providers/CartProvider'
import { PageViewTracker } from '@/components/analytics/PageViewTracker'

interface ProvidersProps {
  children: ReactNode
}

// reducedMotion="user": with the OS setting on, transforms are skipped and only opacity fades remain.
export function Providers({ children }: ProvidersProps) {
  return (
    <MotionConfig reducedMotion="user">
      <CartProvider>
        <PageViewTracker />
        {children}
      </CartProvider>
    </MotionConfig>
  )
}
