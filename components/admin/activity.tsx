'use client'

// Live activity for admin: what just happened in the business.
//
// The database writes every event (new order, payment, message, sign-up, low
// stock) to activity_feed as it commits. This provider keeps admin in sync:
// Supabase Realtime pushes a nudge the moment a row lands, and we then refetch
// through /api/admin/activity, so the data shown always comes through the same
// permission-checked path. If Realtime can't connect, a short poll takes over,
// and the header says which mode is active, so "nothing happened" is never
// confused with "not listening".
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FiAlertTriangle, FiBell, FiCheckCircle, FiMail, FiShoppingBag, FiUserPlus, FiX, FiXCircle,
} from 'react-icons/fi'
import type { IconType } from 'react-icons'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export type Activity = {
  id: number
  occurred_at: string
  kind: string
  title: string
  detail: string | null
  link: string | null
}
export type Section = 'orders' | 'messages' | 'customers' | 'products'
type Connection = 'connecting' | 'live' | 'polling'
type Badges = { ordersToFulfil: number | null; openMessages: number | null }

const KIND: Record<string, { icon: IconType; section: Section; attention?: boolean }> = {
  'order.placed': { icon: FiShoppingBag, section: 'orders' },
  'payment.received': { icon: FiCheckCircle, section: 'orders' },
  'payment.failed': { icon: FiAlertTriangle, section: 'orders', attention: true },
  'order.cancelled': { icon: FiXCircle, section: 'orders' },
  'message.received': { icon: FiMail, section: 'messages' },
  'subscriber.new': { icon: FiUserPlus, section: 'customers' },
  'stock.low': { icon: FiAlertTriangle, section: 'products', attention: true },
}
const kindOf = (k: string) => KIND[k] ?? { icon: FiBell, section: 'orders' as Section }

const POLL_LIVE_MS = 120_000 // safety net while Realtime is connected
const POLL_FALLBACK_MS = 20_000 // when Realtime is unavailable
const TOAST_MS = 7_000
const DESKTOP_KEY = 'fh-admin-desktop-alerts'

type ActivityState = {
  items: Activity[]
  unread: number
  lastSeenAt: string | null
  badges: Badges
  connection: Connection
  /** False until the activity database update is applied. */
  available: boolean
  /** Section → count of unseen events there (for nav dots). */
  unseenBy: Record<Section, number>
  /** Section → bumps each time a new event arrives there; pages refetch on change. */
  signals: Record<Section, number>
  markSeen: () => void
  refresh: () => void
}

const ActivityContext = createContext<ActivityState | null>(null)

export function useActivity() {
  return useContext(ActivityContext)
}

/** A number that changes whenever something new happens in `section`. Use it as an effect dependency to refetch. */
export function useActivitySignal(section: Section) {
  return useContext(ActivityContext)?.signals[section] ?? 0
}

/** Re-runs `reload` when new activity arrives in `section` (not on first render). */
export function useLiveReload(section: Section, reload: () => void) {
  const signal = useActivitySignal(section)
  const first = useRef(true)
  const latest = useRef(reload)
  latest.current = reload
  useEffect(() => {
    if (first.current) { first.current = false; return }
    latest.current()
  }, [signal])
}

const zero = (): Record<Section, number> => ({ orders: 0, messages: 0, customers: 0, products: 0 })

export function ActivityProvider({ tenantId, children }: { tenantId: string; children: React.ReactNode }) {
  const [items, setItems] = useState<Activity[]>([])
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)
  const [badges, setBadges] = useState<Badges>({ ordersToFulfil: null, openMessages: null })
  const [connection, setConnection] = useState<Connection>('connecting')
  const [available, setAvailable] = useState(true)
  const [signals, setSignals] = useState(zero)
  const [toasts, setToasts] = useState<Activity[]>([])
  const known = useRef<Set<number> | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  const notifyDesktop = useCallback((fresh: Activity[]) => {
    try {
      if (!document.hidden || localStorage.getItem(DESKTOP_KEY) !== 'on') return
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      for (const a of fresh.slice(0, 3)) {
        const n = new Notification(a.title, { body: a.detail ?? undefined, tag: `fh-activity-${a.id}` })
        n.onclick = () => { window.focus(); if (a.link) window.location.assign(a.link) }
      }
    } catch { /* notifications are a convenience */ }
  }, [])

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/activity', { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (!data) return
    const next: Activity[] = data.items ?? []
    setItems(next)
    setLastSeenAt(data.lastSeenAt ?? null)
    setBadges(data.badges ?? { ordersToFulfil: null, openMessages: null })
    setAvailable(data.available !== false)

    // Anything we haven't seen in this tab is "fresh": toast it and nudge its page.
    // The first load only records what exists, so opening admin isn't a burst of toasts.
    if (known.current === null) {
      known.current = new Set(next.map((a) => a.id))
      return
    }
    const fresh = next.filter((a) => !known.current!.has(a.id))
    if (!fresh.length) return
    fresh.forEach((a) => known.current!.add(a.id))
    setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 4))
    setSignals((s) => {
      const out = { ...s }
      for (const a of fresh) out[kindOf(a.kind).section] += 1
      return out
    })
    notifyDesktop(fresh)
  }, [notifyDesktop])

  // Coalesce bursts: one request at a time, plus at most one follow-up.
  const refresh = useCallback(() => {
    if (inFlight.current) { again.current = true; return }
    inFlight.current = load().catch(() => {}).finally(() => {
      inFlight.current = null
      if (again.current) { again.current = false; refresh() }
    })
  }, [load])

  // Realtime nudges.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      try { await supabase.realtime.setAuth() } catch { /* falls back to polling */ }
      if (cancelled) return
      channel = supabase
        .channel(`activity:${tenantId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_feed', filter: `tenant_id=eq.${tenantId}` }, () => refresh())
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') { setConnection('live'); refresh() }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnection('polling')
        })
    })()
    // If it hasn't connected in 10s, say so and poll.
    const timeout = setTimeout(() => setConnection((c) => (c === 'connecting' ? 'polling' : c)), 10_000)
    return () => {
      cancelled = true
      clearTimeout(timeout)
      if (channel) supabase.removeChannel(channel)
    }
  }, [tenantId, refresh])

  // Polling: a slow safety net while live, faster when Realtime is unavailable.
  useEffect(() => {
    refresh()
    const every = connection === 'live' ? POLL_LIVE_MS : POLL_FALLBACK_MS
    const id = setInterval(() => { if (!document.hidden) refresh() }, every)
    const wake = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [connection, refresh])

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const markSeen = useCallback(() => {
    setLastSeenAt(new Date().toISOString())
    fetch('/api/admin/activity', { method: 'POST' }).catch(() => {})
  }, [])

  const { unread, unseenBy } = useMemo(() => {
    const seenMs = lastSeenAt ? Date.parse(lastSeenAt) : 0
    const by = zero()
    let n = 0
    for (const a of items) {
      if (Date.parse(a.occurred_at) > seenMs) { n++; by[kindOf(a.kind).section]++ }
    }
    return { unread: n, unseenBy: by }
  }, [items, lastSeenAt])

  // Unread count in the browser tab title, so a backgrounded admin tab still signals.
  const pathname = usePathname()
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s/, '')
    document.title = unread ? `(${unread > 9 ? '9+' : unread}) ${base}` : base
  }, [unread, pathname])

  const value = useMemo<ActivityState>(
    () => ({ items, unread, lastSeenAt, badges, connection, available, unseenBy, signals, markSeen, refresh }),
    [items, unread, lastSeenAt, badges, connection, available, unseenBy, signals, markSeen, refresh],
  )

  return (
    <ActivityContext.Provider value={value}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </ActivityContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

function KindIcon({ kind }: { kind: string }) {
  const { icon: Icon, attention } = kindOf(kind)
  return (
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${attention ? 'border-final-ember/40 text-final-ember' : 'border-final-off-white/15 text-final-off-white'}`}>
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </span>
  )
}

function Toast({ a, onDismiss: dismissById }: { a: Activity; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const onDismiss = () => dismissById(a.id)
  useEffect(() => {
    if (paused) return
    const id = setTimeout(() => dismissById(a.id), TOAST_MS)
    return () => clearTimeout(id)
  }, [paused, a.id, dismissById])

  const body = (
    <>
      <KindIcon kind={a.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{a.title}</span>
        {a.detail && <span className="mt-0.5 block truncate text-xs text-final-muted">{a.detail}</span>}
      </span>
    </>
  )
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-[min(360px,calc(100vw-32px))] items-center gap-3 rounded-xl border border-final-off-white/15 bg-final-dark-gray/95 p-3 shadow-2xl backdrop-blur-xl"
    >
      {a.link ? (
        <Link href={a.link} onClick={onDismiss} className="flex min-w-0 flex-1 items-center gap-3">{body}</Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded-md p-1.5 text-final-muted hover:bg-final-off-white/10 hover:text-final-off-white">
        <FiX className="h-4 w-4" />
      </button>
    </motion.li>
  )
}

function Toasts({ toasts, onDismiss }: { toasts: Activity[]; onDismiss: (id: number) => void }) {
  return (
    <ol aria-live="polite" aria-label="Notifications" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((a) => <Toast key={a.id} a={a} onDismiss={onDismiss} />)}
      </AnimatePresence>
    </ol>
  )
}

/** "Live" / "Checking every 20s" — so a quiet feed is never mistaken for a broken one. */
export function LiveStatus() {
  const ctx = useActivity()
  if (!ctx) return null
  const live = ctx.connection === 'live'
  const label = live ? 'Live' : ctx.connection === 'connecting' ? 'Connecting' : `Every ${POLL_FALLBACK_MS / 1000}s`
  const hint = live
    ? 'Updates appear the moment they happen.'
    : ctx.connection === 'connecting' ? 'Connecting to live updates…' : `Live updates unavailable; checking every ${POLL_FALLBACK_MS / 1000} seconds.`
  return (
    <span title={hint} className="hidden items-center gap-1.5 px-2 text-xs text-final-muted md:inline-flex">
      <span className="relative flex h-2 w-2" aria-hidden>
        {live && <span className="absolute inset-0 animate-ping rounded-full bg-final-off-white/60 motion-reduce:animate-none" />}
        <span className={`relative h-2 w-2 rounded-full ${live ? 'bg-final-off-white' : 'border border-final-muted'}`} />
      </span>
      {label}
      <span className="sr-only">: {hint}</span>
    </span>
  )
}

function DesktopAlertsToggle() {
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'blocked'>('off')
  useEffect(() => {
    try {
      if (typeof Notification === 'undefined') return setState('unsupported')
      if (Notification.permission === 'denied') return setState('blocked')
      setState(Notification.permission === 'granted' && localStorage.getItem(DESKTOP_KEY) === 'on' ? 'on' : 'off')
    } catch { setState('unsupported') }
  }, [])
  if (state === 'unsupported') return null

  async function toggle() {
    try {
      if (state === 'on') { localStorage.setItem(DESKTOP_KEY, 'off'); return setState('off') }
      const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (p !== 'granted') return setState(p === 'denied' ? 'blocked' : 'off')
      localStorage.setItem(DESKTOP_KEY, 'on')
      setState('on')
    } catch { /* ignore */ }
  }
  return (
    <div className="flex items-center justify-between gap-3 border-t border-final-off-white/10 px-4 py-3 text-xs text-final-muted">
      <span>{state === 'blocked' ? 'Desktop alerts are blocked in this browser’s site settings.' : 'Desktop alerts when this tab is in the background'}</span>
      {state !== 'blocked' && (
        <button type="button" role="switch" aria-checked={state === 'on'} onClick={toggle}
          className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${state === 'on' ? 'border-final-off-white bg-final-off-white' : 'border-final-off-white/25'}`}>
          <span className={`absolute left-0 top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${state === 'on' ? 'translate-x-[18px] bg-final-black' : 'translate-x-0.5 bg-final-muted'}`} />
          <span className="sr-only">Desktop alerts</span>
        </button>
      )}
    </div>
  )
}

/** Header bell: unread count, and a panel of recent activity. */
export function ActivityBell() {
  const ctx = useActivity()
  const [open, setOpen] = useState(false)
  // Items that were unread when the panel opened stay marked "new" until it closes.
  const [newSince, setNewSince] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const now = useNow()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  if (!ctx) return null
  const { items, unread, markSeen } = ctx

  function toggle() {
    if (!open) {
      setNewSince(ctx!.lastSeenAt ?? '1970-01-01T00:00:00Z')
      if (unread) markSeen()
    }
    setOpen((o) => !o)
  }
  const isNew = (a: Activity) => !!newSince && Date.parse(a.occurred_at) > Date.parse(newSince)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `Activity, ${unread} new` : 'Activity'}
        className="relative inline-flex items-center rounded-lg p-2 text-final-muted transition-colors hover:bg-final-off-white/5 hover:text-final-off-white active:scale-[0.97]"
      >
        <FiBell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key={unread}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: 'spring', bounce: 0.3, duration: 0.35 }}
              className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-final-ember px-1 text-[10px] font-bold tabular-nums text-final-black"
              aria-hidden
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Recent activity"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
            style={{ transformOrigin: 'top right' }}
            className="fixed inset-x-4 top-16 z-50 overflow-hidden rounded-xl border border-final-off-white/15 bg-final-dark-gray shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px]"
          >
            <div className="flex items-center justify-between border-b border-final-off-white/10 px-4 py-3">
              <p className="text-sm font-semibold">Activity</p>
              <LiveStatusInline />
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm">{ctx.available ? 'Nothing yet' : 'Activity isn’t switched on yet'}</p>
                <p className="mt-1 text-xs text-final-muted">
                  {ctx.available
                    ? 'New orders, payments, messages and sign-ups will appear here as they happen.'
                    : 'It starts recording once the latest database update is applied.'}
                </p>
              </div>
            ) : (
              <ul className="max-h-[min(60vh,440px)] divide-y divide-final-off-white/5 overflow-y-auto">
                {items.map((a) => {
                  const inner = (
                    <>
                      <KindIcon kind={a.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{a.title}</span>
                          <time dateTime={a.occurred_at} title={new Date(a.occurred_at).toLocaleString('en-GB')} className="shrink-0 text-[11px] tabular-nums text-final-muted">
                            {timeAgo(a.occurred_at, now)}
                          </time>
                        </span>
                        {a.detail && <span className="mt-0.5 block truncate text-xs text-final-muted">{a.detail}</span>}
                      </span>
                      {isNew(a) && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-final-ember" aria-label="New" />}
                    </>
                  )
                  return (
                    <li key={a.id}>
                      {a.link ? (
                        <Link href={a.link} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-final-off-white/5">{inner}</Link>
                      ) : (
                        <div className="flex items-start gap-3 px-4 py-3">{inner}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <DesktopAlertsToggle />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LiveStatusInline() {
  const ctx = useActivity()
  if (!ctx) return null
  const live = ctx.connection === 'live'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-final-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-final-off-white' : 'border border-final-muted'}`} aria-hidden />
      {live ? 'Live' : ctx.connection === 'connecting' ? 'Connecting' : `Refreshing every ${POLL_FALLBACK_MS / 1000}s`}
    </span>
  )
}

/** Nav badge: a standing count (e.g. orders to fulfil); ember when something new arrived there. */
export function NavBadge({ section }: { section: Section }) {
  const ctx = useActivity()
  if (!ctx) return null
  const count = section === 'orders' ? ctx.badges.ordersToFulfil : section === 'messages' ? ctx.badges.openMessages : null
  const fresh = ctx.unseenBy[section] > 0
  if (!count && !fresh) return null
  const label = section === 'orders' ? 'to fulfil' : section === 'messages' ? 'open' : 'new'
  if (!count) {
    return <span className="h-1.5 w-1.5 rounded-full bg-final-ember" aria-label="new activity" />
  }
  return (
    <span
      className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${fresh ? 'bg-final-ember text-final-black' : 'bg-final-off-white/10 text-final-off-white'}`}
      aria-label={`${count} ${label}${fresh ? ', new activity' : ''}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
