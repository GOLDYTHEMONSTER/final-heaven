'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

/** Time left until `target` (ms since epoch), split for display. Never negative. */
export function timeLeft(target: number, now: number) {
  const s = Math.max(0, Math.floor((target - now) / 1000))
  return { done: s === 0, days: Math.floor(s / 86_400), hours: Math.floor(s / 3_600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60 }
}

/** The current time, ticking every second while `active` and the tab is visible. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    let id: number | undefined
    const start = () => { setNow(Date.now()); id = window.setInterval(() => setNow(Date.now()), 1000) }
    const stop = () => window.clearInterval(id)
    const onVisibility = () => (document.hidden ? stop() : start())
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [active])
  return now
}

/** One digit that rolls up to its next value, like a mechanical counter. */
function Digit({ value }: { value: string }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden align-top">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          className="absolute inset-0 text-center"
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function Unit({ value, label }: { value: number; label: string }) {
  const text = String(value).padStart(2, '0')
  return (
    <div className="launch-tile relative flex flex-col items-center rounded-xl border border-final-off-white/10 bg-final-black/70 px-1 pb-2.5 pt-3">
      <span className="display text-[2rem] leading-none tabular-nums sm:text-[2.35rem]" aria-hidden>
        {text.split('').map((d, i) => <Digit key={`${label}-${text.length - i}`} value={d} />)}
      </span>
      <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-final-muted">{label}</span>
    </div>
  )
}

/** Days, hours, minutes and seconds to opening, each digit rolling as it changes. */
export function Countdown({ target, now }: { target: number; now: number }) {
  const t = timeLeft(target, now)
  const spoken = `${t.days} days, ${t.hours} hours and ${t.minutes} minutes to go`
  return (
    <div role="timer" aria-label={spoken} className="grid grid-cols-4 gap-2">
      <Unit value={t.days} label="Days" />
      <Unit value={t.hours} label="Hrs" />
      <Unit value={t.minutes} label="Min" />
      <Unit value={t.seconds} label="Sec" />
    </div>
  )
}
