'use client'

import { useEffect, useState } from 'react'

type Item = { id: string; level: 'green' | 'amber' | 'red'; label: string; detail: string; fix: string | null }

const DOT = { green: 'bg-green-400', amber: 'bg-yellow-400', red: 'bg-final-ember' } as const
const WORD = { green: 'Ready', amber: 'Check', red: 'Fix' } as const

/** Launch checklist at the top of Store settings. Server-computed; shows no secret values. */
export function LaunchChecklist() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/launch-check', { cache: 'no-store' }).then(async (res) => {
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Couldn’t load the launch checklist.')
      setItems(body.items)
    }).catch((e) => setError((e as Error).message))
  }, [])

  const red = items?.filter((i) => i.level === 'red').length ?? 0
  const amber = items?.filter((i) => i.level === 'amber').length ?? 0

  return (
    <section className="mb-6 rounded-xl border border-final-off-white/10 bg-final-gray p-5" aria-label="Launch checklist">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Launch checklist</h2>
        {items && (
          <p className={`text-sm ${red ? 'text-final-ember' : amber ? 'text-yellow-400' : 'text-green-400'}`}>
            {red ? `${red} to fix` : amber ? `${amber} to check` : 'Ready to launch'}{red && amber ? `, ${amber} to check` : ''}
          </p>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-final-ember">{error}</p>}
      {!items && !error && <p className="mt-3 text-sm text-final-muted">Checking…</p>}
      {items && (
        <ul className="mt-3 divide-y divide-final-off-white/10 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-3 py-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[i.level]}`} aria-hidden />
              <div className="min-w-0">
                <p><span className="sr-only">{WORD[i.level]}: </span>{i.label} <span className="text-final-muted">· {i.detail}</span></p>
                {i.fix && <p className="text-xs text-final-muted">{i.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
