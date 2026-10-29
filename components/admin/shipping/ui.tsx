'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Shared pieces of the Shipping admin (app/studio/(panel)/shipping). The figures come
// from the server (lib/shipping); nothing here calculates money.

export const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm text-final-off-white focus:border-final-off-white/40 focus:outline-none'
export const label = 'block text-xs text-final-muted'
export const card = 'rounded-xl border border-final-off-white/10 bg-final-gray p-5'
export const button = 'rounded-lg bg-final-off-white px-4 py-2 text-sm font-semibold text-final-black disabled:opacity-50'
export const ghost = 'rounded-lg border border-final-off-white/15 px-3 py-1.5 text-sm text-final-off-white hover:border-final-off-white/40 disabled:opacity-50'

/** Kobo as naira for display: whole naira, "—" when unknown. */
export function naira(kobo: number | null | undefined, opts: { sign?: boolean } = {}) {
  if (kobo == null || !Number.isFinite(kobo)) return '—'
  const v = Math.round(kobo / 100)
  const s = `₦${Math.abs(v).toLocaleString('en-NG')}`
  return v < 0 ? `−${s}` : opts.sign && v > 0 ? `+${s}` : s
}
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`)
export const kg = (v: number | null | undefined) => (v == null ? '—' : v < 1 ? `${Math.round(v * 1000)} g` : `${Math.round(v * 100) / 100} kg`)

/** JSON from an admin endpoint, or an Error carrying the server's message. */
export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.')
  return data as T
}

/** A key that makes a retried click harmless (the database keeps one result per key). */
export const requestKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const TABS = [
  ['Overview', '/studio/shipping'], ['Rates and rules', '/studio/shipping/rates'], ['Shipments', '/studio/shipping/shipments'],
  ['Clearance', '/studio/shipping/campaigns'], ['Simulator', '/studio/shipping/simulate'], ['Ledger', '/studio/shipping/ledger'],
] as const

export function ShippingHeader({ title, intro, children }: { title: string; intro: React.ReactNode; children?: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="mb-6">
      <nav aria-label="Shipping" className="-mx-1 mb-5 overflow-x-auto">
        <ul className="flex gap-1">
          {TABS.map(([name, href]) => (
            <li key={href}>
              <Link href={href} aria-current={path === href ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${path === href ? 'bg-final-off-white text-final-black' : 'text-final-muted hover:text-final-off-white'}`}>
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="display text-3xl md:text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-final-muted">{intro}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Alert({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'warn' | 'ok' }) {
  const cls = tone === 'ok' ? 'border-emerald-400/30 text-emerald-300' : tone === 'warn' ? 'border-yellow-400/30 text-yellow-200' : 'border-final-ember/40 text-final-ember'
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-lg border p-3 text-sm ${cls}`}>{children}</div>
}

export function Tile({ label: name, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'warn' | 'ok' }) {
  return (
    <div className={card}>
      <p className="text-sm text-final-muted">{name}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === 'warn' ? 'text-final-ember' : tone === 'ok' ? 'text-emerald-300' : ''}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-final-muted">{note}</p>}
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  ready: 'border-emerald-400/30 text-emerald-300', ready_with_warnings: 'border-yellow-400/30 text-yellow-200',
  missing_data: 'border-final-off-white/20 text-final-muted', needs_review: 'border-final-ember/40 text-final-ember',
  verified: 'border-emerald-400/30 text-emerald-300', estimated: 'border-yellow-400/30 text-yellow-200', incomplete: 'border-final-ember/40 text-final-ember',
}
export function Pill({ value, children }: { value: string; children?: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[value] ?? 'border-final-off-white/20 text-final-muted'}`}>{children ?? value.replace(/_/g, ' ')}</span>
}

/** A labelled input bound to a string field of a form object. */
export function Input({ name, value, onChange, label: text, type = 'text', placeholder, step, className = '' }: {
  name: string; value: string; onChange: (name: string, value: string) => void; label: string; type?: string; placeholder?: string; step?: string; className?: string
}) {
  return (
    <label className={`${label} ${className}`}>{text}
      <input name={name} type={type} step={step} value={value} placeholder={placeholder} onChange={(e) => onChange(name, e.target.value)} className={`${field} mt-1`} />
    </label>
  )
}
