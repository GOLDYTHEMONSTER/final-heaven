'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'

// Pages that never go to analytics: staff areas, and pages whose URLs carry tokens.
const EXCLUDED = /^\/(studio|admin|login|unsubscribe)(\/|$)/
const KEEP_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign']

/**
 * Vercel Web Analytics (cookieless; collects only on Vercel deployments with
 * Web Analytics enabled). Before anything is sent:
 *  - visitors with Do Not Track or Global Privacy Control are not counted
 *  - the admin area (and its old addresses) and unsubscribe pages are never sent
 *  - query strings are removed except UTM campaign tags, because on this site
 *    they can carry payment references, order numbers or unsubscribe tokens
 */
function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return null
  try {
    const url = new URL(event.url)
    if (EXCLUDED.test(url.pathname)) return null
    const kept = new URLSearchParams()
    for (const key of KEEP_PARAMS) {
      const value = url.searchParams.get(key)
      if (value) kept.set(key, value)
    }
    url.search = kept.toString()
    url.hash = ''
    return { ...event, url: url.toString() }
  } catch {
    return null
  }
}

export function VercelAnalytics() {
  return <Analytics beforeSend={beforeSend} />
}
