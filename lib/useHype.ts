'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { climbed, hypeTier, type Rank } from '@/lib/hype'

// Hype in the browser. Every card and product page asks for its product's
// score through useHype; requests made in the same moment go to /api/hype as
// one call. While Hype is off the server says so and nothing is shown.

export type HypeData = { score: number; rank: Rank; early: boolean; hypes: number }
type Climb = 'rank' | 'tier' | null
type Entry = { data: HypeData | null; mine: boolean; pending: boolean; climb: Climb }
const standing = (d: HypeData | null) => ({ rank: d?.rank ?? 'unseen' as Rank, tier: d ? hypeTier(d.score, d.rank, d.early) : null })

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let enabled: boolean | null = null
let queue = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let version = 0

const notify = () => { version += 1; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function request(id: string) {
  if (entries.has(id) || queue.has(id) || enabled === false) return
  queue.add(id)
  timer ??= setTimeout(async () => {
    const ids = [...queue]
    queue = new Set()
    timer = null
    try {
      // The endpoint takes 60 ids at a time.
      const chunks = Array.from({ length: Math.ceil(ids.length / 60) }, (_, i) => ids.slice(i * 60, i * 60 + 60))
      const bodies = await Promise.all(chunks.map((c) => fetch(`/api/hype?ids=${c.map(encodeURIComponent).join(',')}`).then((r) => r.json())))
      enabled = bodies.every((b) => b.enabled === true)
      for (const body of bodies) {
        for (const pid of Object.keys(body.products ?? {})) entries.set(pid, { data: body.products[pid], mine: (body.mine ?? []).includes(pid), pending: false, climb: null })
        for (const pid of body.mine ?? []) entries.set(pid, { ...(entries.get(pid) ?? { data: null, pending: false, climb: null as Climb }), mine: true })
      }
      for (const pid of ids) if (!entries.has(pid)) entries.set(pid, { data: null, mine: false, pending: false, climb: null })
    } catch {
      // Hype is decoration: if it can't load, the store simply shows none.
    }
    notify()
  }, 40)
}

/** A product's hype, whether this browser hyped it, and the tap. */
export function useHype(productId: string) {
  useSyncExternalStore(subscribe, () => version, () => 0)
  useEffect(() => { request(productId) }, [productId])
  const entry = entries.get(productId)

  const hype = useCallback(async (): Promise<'accepted' | 'duplicate' | 'failed'> => {
    const current = entries.get(productId)
    if (!current || current.mine || current.pending) return 'duplicate'
    entries.set(productId, { ...current, pending: true })
    notify()
    try {
      const res = await fetch('/api/hype', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.enabled === false) throw new Error(body.error)
      const data = { score: body.score, rank: body.rank, early: body.early, hypes: body.hypes }
      entries.set(productId, { data, mine: true, pending: false, climb: climbed(standing(current.data), standing(data)) })
      notify()
      return body.status === 'accepted' ? 'accepted' : 'duplicate'
    } catch {
      entries.set(productId, { ...current, pending: false })
      notify()
      return 'failed'
    }
  }, [productId])

  const data = entry?.data ?? null
  return { enabled: enabled === true, data, tier: standing(data).tier, mine: entry?.mine ?? false, pending: entry?.pending ?? false, climb: entry?.climb ?? null, hype }
}
