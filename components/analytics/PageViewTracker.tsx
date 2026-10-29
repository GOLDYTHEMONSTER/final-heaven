'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/analytics'

// The admin area (sign-in included), and its old addresses, which now 404.
const EXCLUDED = /^\/(studio|admin|login)(\/|$)/

/** Records a page view on every storefront navigation (the admin area is skipped). */
export function PageViewTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || EXCLUDED.test(pathname)) return
    track('page_view')
  }, [pathname])
  return null
}
