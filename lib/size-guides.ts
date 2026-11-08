// The size guide a product page shows: the product's own chart when it has one
// (product.size_chart), otherwise a standard guide for its kind, so every sized
// piece gets a table without anyone filling one in. Standard guides are body
// measurements and say so; a product's own chart always wins.
import type { SizeChart } from '@/lib/product-tables'

export type SizeGuide = { chart: SizeChart; standard: boolean; note?: string }

type Kind = 'tops' | 'bottoms' | 'shoes' | 'gloves'

const range = (a: number, b: number) => `${a}–${b}`
const LETTERS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'] as const
const step = (from: number, width: number) => Object.fromEntries(LETTERS.map((s, i) => [s, range(from + i * width, from + (i + 1) * width)]))

/** Body measurements in cm, by size. Shoes are EU sizes by foot length (EU 35 = 22.5 cm, half a cm a size). */
const GUIDES: Record<Kind, { headers: string[]; rows: Record<string, string[]>; note: string }> = {
  tops: {
    headers: ['Size', 'Chest (cm)', 'Height (cm)'],
    rows: Object.fromEntries(LETTERS.map((s, i) => [s, [step(80, 4)[s], range(155 + Math.min(i, 6) * 5, 160 + Math.min(i, 6) * 5)]])),
    note: 'Standard body measurements. Measure around the fullest part of your chest.',
  },
  bottoms: {
    headers: ['Size', 'Waist (cm)', 'Hip (cm)'],
    rows: Object.fromEntries(LETTERS.map((s) => [s, [step(62, 4)[s], step(84, 4)[s]]])),
    note: 'Standard body measurements. Measure your natural waist and the fullest part of your hips.',
  },
  shoes: {
    headers: ['EU size', 'Foot length (cm)'],
    rows: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [String(34 + i), [(22 + i * 0.5).toFixed(1)]])),
    note: 'Stand on paper and measure from your heel to your longest toe. Between sizes, take the bigger one.',
  },
  gloves: {
    headers: ['Size', 'Around the palm (cm)'],
    rows: { S: [range(17, 19)], M: [range(19, 21)], L: [range(21, 23)], XL: [range(23, 25)] },
    note: 'Measure around your palm, just below the knuckles, without the thumb.',
  },
}

const BOTTOMS = /\b(shorts?|pants|trousers?|leggings|joggers?|skirt)\b/i
const GLOVES = /\bgloves?\b/i

/** Which standard guide fits a product, from its sizes, category and name; null when none does. */
export function sizeKind(p: { name?: string; category?: string; sizes?: string[] }): Kind | null {
  const sizes = p.sizes ?? []
  if (!sizes.length) return null
  if (sizes.every((s) => /^\d{2}$/.test(s.trim()) && Number(s) >= 34 && Number(s) <= 46)) return 'shoes'
  if (!sizes.every((s) => (LETTERS as readonly string[]).includes(s.trim().toUpperCase()))) return null
  const name = p.name ?? ''
  if (GLOVES.test(name)) return 'gloves'
  if (p.category === 'Pants' || BOTTOMS.test(name)) return 'bottoms'
  if (['T-Shirts', 'Hoodies', 'Sweatshirts', 'Jackets', 'Tracksuits', 'Ladies', 'Sets'].includes(p.category ?? '')) return 'tops'
  return null
}

/** The guide for a product: its own chart, or the standard one cut to its sizes. */
export function sizeGuideFor(p: { name?: string; category?: string; sizes?: string[]; sizeChart?: SizeChart | null }): SizeGuide | null {
  if (p.sizeChart) return { chart: p.sizeChart, standard: false }
  const kind = sizeKind(p)
  if (!kind) return null
  const g = GUIDES[kind]
  const rows = (p.sizes ?? []).map((s) => {
    const key = kind === 'shoes' ? s.trim() : s.trim().toUpperCase()
    return g.rows[key] ? [s.trim(), ...g.rows[key]] : null
  })
  if (rows.some((r) => !r)) return null
  return { chart: { headers: g.headers, rows: rows as string[][] }, standard: true, note: g.note }
}
