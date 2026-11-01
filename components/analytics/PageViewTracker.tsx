'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/analytics'
import { captureAttribution } from '@/lib/attribution-client'

// The admin area (sign-in included), and its old addresses, which now 404.
const EXCLUDED = /^\/(studio|admin|login)(\/|$)/

/** Records a page view on every storefront navigation and keeps the ad tags of a landing (the admin area is skipped). */
export function PageViewTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || EXCLUDED.test(pathname)) return
    captureAttribution()
    track('page_view')
  }, [pathname])
  return null
}
