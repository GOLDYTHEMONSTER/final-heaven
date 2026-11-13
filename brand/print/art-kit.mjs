// Helpers for a design's art.mjs: turn flat line art into ink, set type (never drawn by the model),
// stack the pieces and save a print-ready, fully solid PNG. Everything is built as white-on-transparent
// and recoloured once at the end. See brand/print/WORKFLOW.md.
import sharp from 'sharp'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { solidify, toPng } from './pack.mjs'

const root = dirname(fileURLToPath(import.meta.url))
export const cmPx = (cm, dpi = 300) => Math.round((cm / 2.54) * dpi)
const trim = async (buf) => sharp(await sharp(buf).png().toBuffer()).trim({ threshold: 10 }).png().toBuffer()
const white = (w, h, alpha) => {
  const out = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) { out.fill(255, i * 4, i * 4 + 3); out[i * 4 + 3] = alpha(i) }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

// black-on-white drawing -> white ink with alpha, trimmed, scaled to a width in px.
// fatten < 1 thickens fine hatching (alpha^fatten), so hairlines survive DTF (0.5 mm minimum)
export async function ink(file, width, { fatten = 1 } = {}) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true })
  const buf = await trim(await white(info.width, info.height, (i) => Math.round(255 * Math.pow((255 - data[i]) / 255, fatten))))
  return sharp(buf).resize({ width, kernel: 'lanczos3' }).png().toBuffer()
}

// a line of type, scaled to a width in px. font: Bahnschrift (Windows), any weight 300-700, stretch normal|condensed
export async function type(text, width, { weight = 700, stretch = 'normal', spacing = 0.12, thicken = 0 } = {}) {
  const size = 200
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(text.length * size * (1 + spacing) + 400)}" height="${size * 1.6}">
    <text x="200" y="${size * 1.15}" font-family="Bahnschrift" font-weight="${weight}" font-stretch="${stretch}" font-size="${size}"
      letter-spacing="${size * spacing}" fill="#fff"${thicken ? ` stroke="#fff" stroke-width="${thicken}" stroke-linejoin="round"` : ''}>${text}</text></svg>`
  return sharp(await trim(Buffer.from(svg))).resize({ width, kernel: 'lanczos3' }).png().toBuffer()
}

// Bend artwork over the top of a circle: each column turns to follow the arc (letters stay upright to the
// curve). half = half the width as an angle in radians. (sharp's SVG renderer has no textPath.)
export async function bend(buf, half) {
  const { data, info } = await sharp(buf).extractChannel(3).raw().toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height, cx = w / 2, R = (w / 2) / half
  const OH = Math.ceil(h + R * (1 - Math.cos(half)) + h * Math.sin(half)) + 4
  const at = (x, y) => (x < 0 || y < 0 || x >= w - 1 || y >= h - 1 ? 0 : data[y * w + x])
  const a = Buffer.alloc(w * OH)
  for (let Y = 0; Y < OH; Y++) for (let X = 0; X < w; X++) {
    const dx = X - cx, dy = R - Y
    const sx = cx + Math.atan2(dx, dy) * R, sy = R - Math.hypot(dx, dy)
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
    a[Y * w + X] = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy
  }
  return trim(await white(w, OH, (i) => a[i]))
}

// type set over an arch. sweep = degrees the line spans.
export async function arcType(text, width, { sweep = 120, ...opts } = {}) {
  const straight = await type(text, width * 2, opts) // set large, bend, then scale
  return sharp(await bend(straight, (sweep * Math.PI) / 360)).resize({ width, kernel: 'lanczos3' }).png().toBuffer()
}

// the real three-star mark, white, at a height in px
export const mark = (height) => sharp(join(root, '../logo/mark-white.png')).resize({ height }).png().toBuffer()

// stack pieces top to bottom, centred: [{ buf, gap }] where gap is the space above that piece in px.
// A piece may set dy (move it up into the one above, e.g. a mark inside a wreath) instead of gap.
export async function stack(width, pieces) {
  let y = 0; const comps = []
  for (const p of pieces) {
    const m = await sharp(p.buf).metadata()
    const top = p.over ? p.over(m) : y + (p.gap ?? 0)
    comps.push({ input: p.buf, left: Math.round((width - m.width) / 2) + (p.dx ?? 0), top: Math.round(top) })
    if (!p.over) y = top + m.height
    p.box = { top, height: m.height, width: m.width }
  }
  const height = Math.max(...comps.map((c, i) => c.top + pieces[i].box.height))
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toBuffer()
}

// recolour to one ink, force solid/transparent, save at 300 dpi
export async function save(buf, width, hex, file) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  await sharp(await toPng(await solidify(buf, width, () => rgb), 300)).toFile(file)
  const m = await sharp(file).metadata()
  console.log(file.split(/[\\/]/).pop(), m.width, 'x', m.height, 'px =', (m.width / 300 * 2.54).toFixed(1), 'x', (m.height / 300 * 2.54).toFixed(1), 'cm')
}
