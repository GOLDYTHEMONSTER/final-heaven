'use client'

import { useEffect, useState } from 'react'
import { FiArrowRight } from 'react-icons/fi'
import type { LaunchState } from '@/lib/launch'
import { Countdown, useNow } from './Countdown'
import { OPEN_LAUNCH_GATE } from './LaunchGate'

/**
 * Checkout before launch: how long until it opens (or "November" while the
 * day isn't set), and a way onto the waitlist. Same state as the launch gate.
 */
export function CheckoutCountdown() {
  const [launch, setLaunch] = useState<LaunchState | null>(null)
  useEffect(() => {
    fetch('/api/launch').then((r) => (r.ok ? r.json() : null)).then(setLaunch).catch(() => {})
  }, [])
  const target = launch?.opensAt ? Date.parse(launch.opensAt) : null
  const now = useNow(Boolean(target))

  return (
    <div role="status" className="relative mb-6 overflow-hidden rounded-2xl border border-final-off-white/10 bg-final-black/60 p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="launch-aurora opacity-60" />
      </div>
      <div className="relative">
        <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-final-muted">
          <span className="launch-dot" aria-hidden /> Checkout opens {target ? 'in' : 'in November'}
        </p>
        <div className="mt-4">
          {target ? (
            <Countdown target={target} now={now} />
          ) : (
            <p className="display text-[2.4rem] leading-none sm:text-[3rem]">Coming soon</p>
          )}
        </div>
        <p className="mt-4 text-sm text-final-off-white/70">
          Your cart stays saved on this device. Join the waitlist and we’ll email you the moment checkout opens.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_LAUNCH_GATE))}
          className="btn-secondary mt-4"
        >
          Get the opening email <FiArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
