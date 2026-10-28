// Launch state for the storefront's "coming soon" gate (components/launch).
// Pure, so the countdown the visitor sees and the day checkout opens
// (lib/catalog paymentsState) can't disagree.
import { paymentsState } from '@/lib/catalog'

export type LaunchState = {
  /** Checkout is taking payments: no gate. */
  open: boolean
  /** Opening day (YYYY-MM-DD, store time), or null while it isn't set: the gate says "November". */
  opensOn: string | null
  /** The instant doors open (midnight store time on opening day), for the countdown. */
  opensAt: string | null
}

/** The UTC instant of midnight at the start of `day` in `timeZone`. */
export function zonedMidnight(day: string, timeZone: string): Date {
  const guess = new Date(`${day}T00:00:00Z`)
  // How far the zone's wall clock is from UTC at that moment (Lagos: +1 h).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(guess).map((p) => [p.type, p.value]),
  )
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return new Date(guess.getTime() - (wall - guess.getTime()))
}

export function launchState(
  s: { paymentsOpenOn: string | null; purchasesPaused: boolean },
  timeZone: string,
  today: string,
): LaunchState {
  const p = paymentsState(s, today)
  // A pause after launch isn't "coming soon": the store is open, just not selling.
  if (p.closedFor !== 'launch') return { open: true, opensOn: p.opensOn, opensAt: null }
  return { open: false, opensOn: p.opensOn, opensAt: p.opensOn ? zonedMidnight(p.opensOn, timeZone).toISOString() : null }
}
