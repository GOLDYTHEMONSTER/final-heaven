// Colour swatches for the option pickers: a colour name becomes one or more
// paint colours ("Black Ice Blue" -> black and ice blue, shown split). Names we
// can't read as colours fall back to the product's photo for that colour, then
// to the name as text. The name is always the button's accessible label.

// Longer names first, so "rose gold" wins over "gold" and "sky blue" over "blue".
const PAINT: [string, string][] = [
  ['rose gold', '#b76e79'], ['rose dusk', '#c98a9b'], ['sky blue', '#87c3e8'], ['ice blue', '#9fd8f0'], ['light blue', '#a9cdf0'],
  ['royal blue', '#2547c9'], ['navy blue', '#1b2a4a'], ['cloud blue', '#8ec5f0'], ['grey blue', '#6f8394'], ['gray blue', '#6f8394'],
  ['dust grey', '#9a9a96'], ['space grey', '#4a4c50'], ['army green', '#4b5d2a'], ['lime green', '#b6e03a'], ['mint green', '#a8e6cf'],
  ['coral pink', '#f27c6a'], ['peach pink', '#f6b3a0'], ['sea reef', '#2c2f33'], ['silver white', '#e3e5e8'], ['off white', '#efece4'],
  ['black', '#111111'], ['white', '#f5f5f2'], ['cream', '#efe6d2'], ['ivory', '#f3eddc'], ['beige', '#d9c7a7'], ['khaki', '#b7a57a'],
  ['brown', '#6b4a2f'], ['tan', '#c19a6b'], ['camel', '#c19a6b'], ['grey', '#8a8a8a'], ['gray', '#8a8a8a'], ['silver', '#c0c2c6'],
  ['gold', '#d4af37'], ['red', '#c62828'], ['burgundy', '#7b1e2b'], ['wine', '#722f37'], ['raspberry', '#b3245c'], ['pink', '#f4a6c1'],
  ['peach', '#f6b38f'], ['coral', '#f27c6a'], ['orange', '#f28c28'], ['yellow', '#f2d03b'], ['lime', '#b6e03a'], ['green', '#2e7d32'],
  ['mint', '#a8e6cf'], ['sage', '#9caf88'], ['olive', '#6b6b2f'], ['army', '#4b5d2a'], ['teal', '#1f8a8a'], ['blue', '#1e5bd8'],
  ['navy', '#1b2a4a'], ['purple', '#6a3fa0'], ['violet', '#7f52b3'], ['lilac', '#c8a2c8'], ['lavender', '#b9a7dd'], ['taro', '#a58bc6'],
  ['charcoal', '#36393d'], ['graphite', '#3b3d40'], ['clear', 'transparent'],
]
const RAINBOW = 'conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)'

/** The paint colours a name mentions, in order; empty when it names none. */
export function paintsOf(name: string): string[] {
  let rest = ` ${name.toLowerCase().replace(/[^a-z ]+/g, ' ')} `
  const found: { at: number; hex: string }[] = []
  for (const [word, hex] of PAINT) {
    const at = rest.indexOf(` ${word} `)
    if (at < 0) continue
    found.push({ at, hex })
    rest = rest.slice(0, at) + ' '.repeat(word.length + 1) + rest.slice(at + word.length + 1)
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.hex).slice(0, 3)
}

/** A CSS background for a swatch: one colour, a split of two or three, or a rainbow for "colourful". */
export function swatchBackground(name: string): string | null {
  const paints = paintsOf(name)
  const rainbow = /colou?rful|rainbow|multi/i.test(name)
  if (!paints.length) return rainbow ? RAINBOW : null
  if (rainbow) return `linear-gradient(135deg, ${paints[0]} 0 50%, transparent 50%), ${RAINBOW}`
  if (paints.length === 1) return paints[0]
  const share = 100 / paints.length
  return `linear-gradient(135deg, ${paints.map((p, i) => `${p} ${i * share}% ${(i + 1) * share}%`).join(', ')})`
}

/** True when the name is only colour words ("Navy Blue", "Black & White"), nothing like "Thunder" or "Polka Dot". */
export function isPlainColour(name: string): boolean {
  let rest = ` ${name.toLowerCase().replace(/[^a-z ]+/g, ' ')} `
  for (const [word] of PAINT) rest = rest.split(` ${word} `).join('  ')
  return paintsOf(name).length > 0 && rest.replace(/\b(and|with|light|dark)\b/g, ' ').trim() === ''
}

/**
 * How a product's colours are shown: as paint when every name is a plain colour
 * and no two look the same, otherwise as each colour's own photo when every
 * colour has one ("Thunder Black" and "Black Contour" are both black paint, but
 * their photos tell them apart). 'mixed' does the best per colour.
 */
export function swatchMode(colors: string[], photoColors: Set<string>): 'paint' | 'photo' | 'mixed' {
  const paints = colors.map(swatchBackground)
  if (colors.every(isPlainColour) && new Set(paints).size === colors.length) return 'paint'
  if (colors.every((c) => photoColors.has(c))) return 'photo'
  return 'mixed'
}
