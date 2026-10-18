'use client'

// Small, dependency-free SVG charts for the admin dashboard, following the
// dataviz method: emphasis form (neutral marks, the one mark that matters in
// the ember accent), thin marks with 4px rounded data-ends, hairline grids,
// one y-axis per chart, hover AND keyboard-focus tooltips, and a table view.
// Palette checked with the dataviz validator against the dark surface:
// CVD separation 9.3 (>= 8), contrast >= 3:1 for both marks.
import { useId, useState } from 'react'

const NEUTRAL = 'rgb(var(--fg) / 0.32)'
const ACCENT = 'rgb(var(--ember))'
const GRID = 'rgb(var(--fg) / 0.08)'

export type Point = { label: string; value: number }

const niceMax = (v: number) => {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!
}

function Tooltip({ x, title, value }: { x: number; title: string; value: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-final-off-white/15 bg-final-black px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left: `${Math.min(Math.max(x, 8), 92)}%` }}
    >
      <p className="font-semibold text-final-off-white">{value}</p>
      <p className="text-final-muted">{title}</p>
    </div>
  )
}

/** Columns over time; the most recent column is emphasised. */
export function ColumnChart({ points, format, axisFormat, label }: {
  points: Point[]
  format: (v: number) => string
  axisFormat: (v: number) => string
  label: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const W = 720, H = 180, top = 28, left = 44, bottom = 22
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const band = (W - left) / Math.max(points.length, 1)
  const barW = Math.min(24, band * 0.7)
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(points.length / 7)

  return (
    <div className="relative" onMouseLeave={() => setActive(null)}>
      {active !== null && (
        <Tooltip x={((left + band * active + band / 2) / W) * 100} title={points[active].label} value={format(points[active].value)} />
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" className="fill-final-muted text-[11px] tabular-nums">{axisFormat(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = left + band * i + (band - barW) / 2
          const h = Math.max(0, H - bottom - y(p.value))
          const isLast = i === points.length - 1
          const r = Math.min(4, h)
          return (
            <g key={p.label}>
              {h > 0 && (
                // 4px rounded data-end, square at the baseline.
                <path
                  d={`M${x},${H - bottom} V${H - bottom - h + r} Q${x},${H - bottom - h} ${x + r},${H - bottom - h} H${x + barW - r} Q${x + barW},${H - bottom - h} ${x + barW},${H - bottom - h + r} V${H - bottom} Z`}
                  fill={isLast ? ACCENT : NEUTRAL}
                  opacity={active === null || active === i ? 1 : 0.55}
                />
              )}
              {/* Hit target: the whole band, focusable for keyboard readers. */}
              <rect
                x={left + band * i} y={top} width={band} height={H - top - bottom} fill="transparent"
                tabIndex={0} aria-label={`${p.label}: ${format(p.value)}`}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                className="outline-none"
              />
              {(i % labelEvery === 0 || isLast) && (
                <text x={isLast ? W : i === 0 ? left : left + band * i + band / 2} y={H - 6} textAnchor={isLast ? 'end' : i === 0 ? 'start' : 'middle'} className="fill-final-muted text-[11px]">{p.label}</text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** A single line over time, with the latest point marked. */
export function LineChart({ points, format, label }: { points: Point[]; format: (v: number) => string; label: string }) {
  const [active, setActive] = useState<number | null>(null)
  const id = useId()
  const W = 720, H = 160, top = 24, left = 44, bottom = 22
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const step = points.length > 1 ? (W - left - 12) / (points.length - 1) : 0
  const x = (i: number) => left + step * i
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ')
  const area = points.length ? `${d} L${x(points.length - 1)},${H - bottom} L${x(0)},${H - bottom} Z` : ''
  const labelEvery = Math.ceil(points.length / 7)
  const last = points.length - 1

  return (
    <div className="relative" onMouseLeave={() => setActive(null)}>
      {active !== null && <Tooltip x={(x(active) / W) * 100} title={points[active].label} value={format(points[active].value)} />}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" className="fill-final-muted text-[11px] tabular-nums">{Math.round(t)}</text>
          </g>
        ))}
        <defs>
          <linearGradient id={`${id}-wash`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--fg))" stopOpacity="0.10" />
            <stop offset="1" stopColor="rgb(var(--fg))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#${id}-wash)`} />}
        {d && <path d={d} fill="none" stroke="rgb(var(--fg) / 0.7)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={top} y2={H - bottom} stroke="rgb(var(--fg) / 0.25)" strokeWidth={1} />}
        {last >= 0 && (
          // End-dot with a 2px surface ring.
          <circle cx={x(last)} cy={y(points[last].value)} r={4.5} fill={ACCENT} stroke="rgb(var(--surface))" strokeWidth={2} />
        )}
        {points.map((p, i) => (
          <g key={p.label}>
            <rect
              x={x(i) - Math.max(step, 24) / 2} y={top} width={Math.max(step, 24)} height={H - top - bottom} fill="transparent"
              tabIndex={0} aria-label={`${p.label}: ${format(p.value)}`}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} className="outline-none"
            />
            {(i % labelEvery === 0 || i === last) && (
              <text x={i === last ? W : x(i)} y={H - 6} textAnchor={i === last ? 'end' : i === 0 ? 'start' : 'middle'} className="fill-final-muted text-[11px]">{p.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

/** Horizontal bars for ranked or ordered lists. `emphasise` marks one row in the accent. */
export function BarList({ rows, format, emphasise }: {
  rows: { label: string; value: number; note?: string }[]
  format: (v: number) => string
  emphasise?: number
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="text-sm text-final-muted">No data yet.</p>
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-final-muted">
              {format(r.value)}{r.note ? <span className="ml-2 text-xs">{r.note}</span> : null}
            </span>
          </div>
          <div className="h-2 w-full">
            <div
              className="h-2 rounded-r-[4px]"
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 4 : 0, background: i === emphasise ? ACCENT : NEUTRAL }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The table-view twin of a chart: every value readable without hovering. */
export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-final-muted hover:text-final-off-white">Show as table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-final-off-white/10">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-final-gray text-xs text-final-muted">
            <tr>{columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-medium">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-final-off-white/5 tabular-nums">
            {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="px-3 py-1.5">{v}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </details>
  )
}
