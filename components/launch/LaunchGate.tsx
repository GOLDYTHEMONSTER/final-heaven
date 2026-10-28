'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FiArrowRight, FiX } from 'react-icons/fi'
import { NeonMark } from '@/components/ui/NeonMark'
import { LAUNCH_CONSENT } from '@/lib/consent'
import type { LaunchState } from '@/lib/launch'
import { Countdown, timeLeft, useNow } from './Countdown'

// The "coming soon" gate. Until checkout opens (stores.payments_open_on), a
// visitor's first page shows a sheet: Coming soon, a countdown to opening day
// (or "November" while the day isn't set), and the waitlist sign-up. After
// that, a small pill in the corner brings it back. Remembered per browser.
// Styles: .launch-* in app/globals.css.

const KEY = 'fh_launch'
/** Dispatch on window to open the sheet from elsewhere (checkout's countdown). */
export const OPEN_LAUNCH_GATE = 'fh:open-launch'
const SKIP = ['/unsubscribe', '/track', '/privacy', '/terms']

const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const remember = (v: 'seen' | 'joined') => { try { localStorage.setItem(KEY, v) } catch { /* private mode: it just shows again */ } }

const spring = { type: 'spring', bounce: 0, duration: 0.5 } as const

export function LaunchGate() {
  const pathname = usePathname()
  const [launch, setLaunch] = useState<LaunchState | null>(null)
  const [open, setOpen] = useState(false)
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/launch')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: LaunchState | null) => {
        if (cancelled || !s || s.open) return
        setLaunch(s)
        const seen = read()
        setJoined(seen === 'joined')
        if (!seen && !SKIP.some((p) => pathname?.startsWith(p))) {
          // A beat after the page lands, so the store is glimpsed behind it.
          window.setTimeout(() => { if (!cancelled) { remember('seen'); setOpen(true) } }, 1200)
        }
      })
      .catch(() => { /* no gate is better than a broken one */ })
    return () => { cancelled = true }
    // Once per page load: the first visit decides, not every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN_LAUNCH_GATE, show)
    return () => window.removeEventListener(OPEN_LAUNCH_GATE, show)
  }, [])

  const target = launch?.opensAt ? Date.parse(launch.opensAt) : null
  const now = useNow(Boolean(launch && target))

  // Opening time passed while the page was open: let the store take over.
  useEffect(() => {
    if (target && timeLeft(target, now).done) { setOpen(false); setLaunch(null) }
  }, [target, now])

  if (!launch) return null
  return (
    <>
      <AnimatePresence>
        {!open && <LaunchPill key="pill" target={target} now={now} joined={joined} onOpen={() => setOpen(true)} />}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <LaunchSheet
            key="sheet"
            launch={launch}
            target={target}
            now={now}
            joined={joined}
            onJoined={() => { remember('joined'); setJoined(true) }}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function LaunchPill({ target, now, joined, onOpen }: { target: number | null; now: number; joined: boolean; onOpen: () => void }) {
  const t = target ? timeLeft(target, now) : null
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={spring}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex items-center gap-2.5 rounded-full border border-final-off-white/15 bg-final-black/80 py-2 pl-3 pr-4 text-left shadow-[0_8px_30px_rgb(0_0_0/0.45)] backdrop-blur-xl transition-colors hover:border-final-off-white/40 md:bottom-6 md:left-6"
    >
      <span className="launch-dot" aria-hidden />
      <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Coming soon</span>
      <span className="h-3 w-px bg-final-off-white/20" aria-hidden />
      <span className="text-[12px] tabular-nums text-final-muted">
        {t ? `${t.days}d ${String(t.hours).padStart(2, '0')}h ${String(t.minutes).padStart(2, '0')}m` : joined ? 'You’re on the list' : 'Join the waitlist'}
      </span>
    </motion.button>
  )
}

function LaunchSheet({ launch, target, now, joined, onJoined, onClose }: {
  launch: LaunchState; target: number | null; now: number; joined: boolean; onJoined: () => void; onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')

  // Modal behaviour: focus inside, Tab stays inside, Escape closes, the page behind doesn't scroll,
  // and focus returns to where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, input, a[href]')).filter((el) => !el.hasAttribute('disabled'))
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; before?.focus?.() }
  }, [onClose])

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setStatus('error'); setMessage('Enter your email address.'); return }
    if (!consent) { setStatus('error'); setMessage('Tick the box so we can email you.'); return }
    setStatus('loading'); setMessage('')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), consent: true, source: 'launch_waitlist' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setStatus('error'); setMessage(data.error || 'That didn’t go through. Try again in a moment.'); return }
      setStatus('idle')
      onJoined()
    } catch {
      setStatus('error'); setMessage('That didn’t go through. Check your connection and try again.')
    }
  }, [email, consent, onJoined])

  const opensOn = launch.opensOn
    ? new Date(`${launch.opensOn}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    : null

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* The store stays visible behind, dimmed and blurred: a preview, not a wall. */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" onClick={onClose} aria-hidden />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-title"
        aria-describedby="launch-desc"
        tabIndex={-1}
        initial={{ y: 80, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 60, opacity: 0, scale: 0.98 }}
        transition={spring}
        className="launch-sheet relative max-h-[92dvh] w-full max-w-[440px] overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[28px] border border-final-off-white/10 bg-final-gray outline-none sm:rounded-[28px]"
      >
        {/* Clipped to the sheet: the glow is wider than the card and must never make it scroll sideways. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
          <div className="launch-aurora" />
          <div className="launch-grain" />
        </div>

        <div className="relative px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:pb-8 sm:pt-6">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-final-off-white/20 sm:hidden" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-final-off-white/10 bg-final-black/40 text-final-muted transition-colors hover:border-final-off-white/40 hover:text-final-off-white"
          >
            <FiX className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <NeonMark className="mt-3 h-16 sm:h-20" />
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.32em] text-final-muted">Final Heaven · The store</p>

            <h2 id="launch-title" className="display mt-3 text-[3.25rem] sm:text-[4rem]">
              <Rise delay={0.15}>Coming</Rise>
              <Rise delay={0.25} className="heading-muted">Soon</Rise>
            </h2>

            <p id="launch-desc" className="mt-4 max-w-[30ch] text-[15px] leading-relaxed text-final-off-white/75">
              {joined
                ? 'You’re on the list. We’ll email you the moment the doors open.'
                : opensOn
                  ? `Doors open ${opensOn}. Join the waitlist and we’ll email you the moment they do.`
                  : 'Doors open in November. Join the waitlist and we’ll email you the moment they do.'}
            </p>
          </div>

          <motion.div className="mt-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.35 }}>
            {target ? (
              <Countdown target={target} now={now} />
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-final-off-white/10 bg-final-black/70 px-4 py-4 sm:px-5">
                <span className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-final-muted sm:text-[11px]">
                  <span className="launch-dot" aria-hidden /> Opening
                </span>
                <span className="display text-[1.45rem] leading-none sm:text-[1.9rem]">November</span>
              </div>
            )}
          </motion.div>

          <AnimatePresence mode="wait" initial={false}>
            {joined ? (
              <motion.div key="done" className="mt-6 flex flex-col items-center text-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
                <svg viewBox="0 0 52 52" className="h-14 w-14" aria-hidden>
                  <motion.circle cx="26" cy="26" r="24" fill="none" stroke="rgb(var(--ember))" strokeWidth="2"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                  <motion.path d="M15 27l7 7 15-16" fill="none" stroke="rgb(var(--fg))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.45, ease: 'easeOut' }} />
                </svg>
                <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em]">See you at the opening</p>
                <button type="button" onClick={onClose} className="btn-primary mt-5 w-full">
                  Explore the preview <FiArrowRight className="h-4 w-4" />
                </button>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={submit} noValidate className="mt-6" exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <label htmlFor="launch-email" className="sr-only">Email address</label>
                <input
                  id="launch-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={status === 'error'}
                  className="h-12 w-full rounded-xl border border-final-off-white/15 bg-final-black px-4 text-[15px] text-final-off-white placeholder:text-final-muted transition-colors focus:border-final-off-white/60 focus:outline-none"
                />
                <label className="mt-3 flex cursor-pointer items-start gap-3 text-left text-[12px] leading-snug text-final-muted">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--ember))]"
                  />
                  <span>{LAUNCH_CONSENT}</span>
                </label>
                <p role="alert" className="mt-2 min-h-[1.25rem] text-[13px] text-final-ember">{message}</p>
                <button type="submit" disabled={status === 'loading'} className="btn-primary mt-1 w-full disabled:opacity-60">
                  {status === 'loading' ? 'Joining' : 'Join the waitlist'} <FiArrowRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={onClose} className="mt-3 w-full py-2 text-center text-[13px] text-final-muted transition-colors hover:text-final-off-white">
                  Look around first
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** A word that rises into place from behind a mask. */
function Rise({ children, delay, className = '' }: { children: React.ReactNode; delay: number; className?: string }) {
  return (
    <span className="block overflow-hidden pb-[0.06em]">
      <motion.span
        className={`block ${className}`}
        initial={{ y: '105%' }}
        animate={{ y: '0%' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.7, delay }}
      >
        {children}
      </motion.span>
    </span>
  )
}
