// The two tables on a product page: specs, and a size chart. One place for their
// shape and limits, used by the admin products API (strict: says what's wrong),
// the page (tolerant: shows what's usable) and the catalogue script. The
// database repeats the size limits (supabase/migrations/20261104100000).

export type Spec = { label: string; value: string }
/** headers[0] names the size column; every row has one cell per header, the size first. */
export type SizeChart = { unit?: string; headers: string[]; rows: string[][] }

export const TABLE_LIMITS = {
  specs: 30, labelChars: 40, valueChars: 200,
  chartColumns: 8, chartRows: 20, cellChars: 24, unitChars: 8,
} as const

const clean = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Spec rows from anything stored; drops empty rows and trims the rest. */
export function parseSpecs(v: unknown): Spec[] {
  if (!Array.isArray(v)) return []
  const out: Spec[] = []
  for (const item of v) {
    const r = (item ?? {}) as Record<string, unknown>
    const label = clean(r.label, TABLE_LIMITS.labelChars)
    const value = clean(r.value, TABLE_LIMITS.valueChars)
    if (label && value) out.push({ label, value })
    if (out.length === TABLE_LIMITS.specs) break
  }
  return out
}

/** A size chart from anything stored, or null when it can't be shown as a table. */
export function parseSizeChart(v: unknown): SizeChart | null {
  if (!v || typeof v !== 'object') return null
  const raw = v as Record<string, unknown>
  if (!Array.isArray(raw.headers) || !Array.isArray(raw.rows)) return null
  const headers = raw.headers.slice(0, TABLE_LIMITS.chartColumns).map((h) => clean(h, TABLE_LIMITS.cellChars))
  if (headers.length < 2 || headers.some((h) => !h)) return null
  const rows = raw.rows.slice(0, TABLE_LIMITS.chartRows)
    .map((r) => (Array.isArray(r) ? r.slice(0, headers.length).map((c) => clean(c, TABLE_LIMITS.cellChars)) : []))
    .filter((r) => r.length === headers.length && r[0])
  if (!rows.length) return null
  const unit = clean(raw.unit, TABLE_LIMITS.unitChars)
  return unit ? { unit, headers, rows } : { headers, rows }
}

type Checked<T> = { value: T } | { error: string }

/** For writes: the specs, or what's wrong with them. Nothing is silently dropped. */
export function checkSpecs(v: unknown): Checked<Spec[]> {
  if (v == null || (Array.isArray(v) && v.length === 0)) return { value: [] }
  if (!Array.isArray(v)) return { error: 'Specs must be a list of label and value rows.' }
  if (v.length > TABLE_LIMITS.specs) return { error: `Specs can have up to ${TABLE_LIMITS.specs} rows.` }
  const rows = parseSpecs(v)
  if (rows.length !== v.length) return { error: 'Every spec needs a label and a value.' }
  const labels = rows.map((r) => r.label.toLowerCase())
  if (new Set(labels).size !== labels.length) return { error: 'Each spec label can appear only once.' }
  return { value: rows }
}

/** For writes: the size chart, null for none, or what's wrong with it. */
export function checkSizeChart(v: unknown): Checked<SizeChart | null> {
  if (v == null) return { value: null }
  const chart = parseSizeChart(v)
  if (!chart) return { error: `A size chart needs 2 to ${TABLE_LIMITS.chartColumns} headed columns and at least one row, each row as wide as the headers and starting with a size.` }
  const raw = v as { rows: unknown[] }
  if (chart.rows.length !== raw.rows.length) return { error: `Every size row needs ${chart.headers.length} cells, the size first (up to ${TABLE_LIMITS.chartRows} rows).` }
  return { value: chart }
}
