'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/analytics'

/** Records a page view on every storefront navigation (admin and login are skipped). */
export function PageViewTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin') || pathname.startsWith('/login')) return
    track('page_view')
  }, [pathname])
  return null
}
