'use client'

import { useEffect, useState } from 'react'
import type { LaunchState } from '@/lib/launch'

// The store's launch state in the browser, fetched once per page load and
// shared, so the launch gate, checkout's countdown and every "live now / coming
// soon" label read the same answer. null while loading or if it can't load.
let pending: Promise<LaunchState | null> | null = null
/** The launch state as a promise (one request per page load). */
export const loadLaunch = () => (pending ??= fetch('/api/launch').then((r) => (r.ok ? r.json() : null)).catch(() => null))

export function useLaunch() {
  const [state, setState] = useState<LaunchState | null>(null)
  useEffect(() => {
    let live = true
    loadLaunch().then((s) => { if (live) setState(s) })
    return () => { live = false }
  }, [])
  return state
}
