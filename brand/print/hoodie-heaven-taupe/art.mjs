// 13 Nov 2026 (owner): chest mark is now embroidered and the sleeve script is DTF, swapped from the house format.
// Back print for the taupe HEAVEN hoodie (from concept tee-17, brand/designs/concepts-03).
//   HEAVEN: melting outline lettering, redrawn flat as clean line art (GPT Image 2.6, 2k, job 525855be),
//           without the grey drip fill (semi-transparent grey prints as haze on DTF)
//   two lines of type set in Bahnschrift Bold Condensed, thickened, never drawn by the model
//   the mark in a pill outline, from brand/logo
// Every element in ink black #111111 (white lines would barely show on taupe).
// Usage: node brand/print/hoodie-heaven-taupe/art.mjs   then   node brand/print/pack.mjs brand/print/hoodie-heaven-taupe
import sharp from 'sharp'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { solidify, toPng } from '../pack.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const INK = [17, 17, 17]
const W = Math.round((30 / 2.54) * 300) // 30 cm at 300 dpi (owner: cover more space)
const LINES = ['THE CITY ABOVE - WHERE FAITH MEETS TOMORROW', 'FINAL HEAVEN - SEE YOU THERE']
const clear = { r: 0, g: 0, b: 0, alpha: 0 }

// black-on-white source -> alpha mask (dark = ink)
async function inkFromLineart(file) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0; i < info.width * info.height; i++) { out.fill(255, i * 4, i * 4 + 3); out[i * 4 + 3] = 255 - data[i] }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 10 }).png().toBuffer()
}
const text = (s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="14000" height="400">
  <text x="7000" y="260" text-anchor="middle" font-family="Bahnschrift" font-weight="700" font-stretch="condensed"
  font-size="200" letter-spacing="46" fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round">${s}</text></svg>`)
const trimmed = async (buf) => sharp(await sharp(buf).png().toBuffer()).trim({ threshold: 1 }).png().toBuffer()

// Bend the word round an arc (owner, 10 Nov: "the heaven should be more curved"). Each letter turns
// to follow the circle instead of just sliding down. BEND = half the word's width as an angle.
// Owner picked this version from the spec PDF (10 Nov): BEND 0.42 on the drawing as drawn, no levelling,
// tight spacing underneath. level() below is kept for designs that need an even arch; it isn't used here.
const BEND = 0.42 // radians, about 24 degrees each side
async function arc(buf) {
  const { data, info } = await sharp(buf).extractChannel(3).raw().toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height, cx = w / 2, R = (w / 2) / BEND
  const OW = w, OH = Math.ceil(h + R * (1 - Math.cos(BEND)) + h * Math.sin(BEND)) + 4
  const out = Buffer.alloc(OW * OH * 4)
  const at = (x, y) => (x < 0 || y < 0 || x >= w - 1 || y >= h - 1 ? 0 : data[y * w + x])
  for (let Y = 0; Y < OH; Y++) for (let X = 0; X < OW; X++) {
    const dx = X - cx, dy = R - Y // circle centre at (cx, R); the top of the word touches y = 0
    const sx = cx + Math.atan2(dx, dy) * R, sy = R - Math.hypot(dx, dy)
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
    const a = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy
    const p = (Y * OW + X) * 4; out[p] = out[p + 1] = out[p + 2] = 255; out[p + 3] = a
  }
  return sharp(await sharp(out, { raw: { width: OW, height: OH, channels: 4 } }).png().toBuffer()).trim({ threshold: 10 }).png().toBuffer()
}
// Straighten the drawing: fit a parabola to the top edge of the ink across the word and shift every
// column so that curve becomes a straight line. Letter-to-letter height differences stay.
async function level(buf) {
  const { data, info } = await sharp(buf).extractChannel(3).raw().toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height
  const xs = [], ys = []
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (data[y * w + x] > 128) { xs.push(x / w - 0.5); ys.push(y); break }
  // least squares: y = a + b x + c x^2
  const S = (f) => xs.reduce((s, x, i) => s + f(x, ys[i]), 0)
  const M = [[xs.length, S((x) => x), S((x) => x * x)], [S((x) => x), S((x) => x * x), S((x) => x ** 3)], [S((x) => x * x), S((x) => x ** 3), S((x) => x ** 4)]]
  const v = [S((x, y) => y), S((x, y) => x * y), S((x, y) => x * x * y)]
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(M), swap = (k) => M.map((r, i) => r.map((c, j) => (j === k ? v[i] : c)))
  const [a, b, c] = [0, 1, 2].map((k) => det(swap(k)) / D)
  const q = (x) => a + b * (x / w - 0.5) + c * (x / w - 0.5) ** 2
  let qmin = Infinity, qmax = -Infinity
  for (let x = 0; x < w; x++) { qmin = Math.min(qmin, q(x)); qmax = Math.max(qmax, q(x)) }
  const pad = Math.ceil(qmax - qmin), OH = h + pad
  const out = Buffer.alloc(w * OH * 4)
  for (let x = 0; x < w; x++) {
    const shift = Math.round(q(x) - qmin) // lift this column by its droop
    for (let y = 0; y < h; y++) {
      const Y = y - shift + pad
      if (Y < 0 || Y >= OH) continue
      const p = (Y * w + x) * 4; out[p] = out[p + 1] = out[p + 2] = 255; out[p + 3] = data[y * w + x]
    }
  }
  console.log('levelled: removed', Math.round(qmax - qmin), 'px of droop')
  return sharp(await sharp(out, { raw: { width: w, height: OH, channels: 4 } }).png().toBuffer()).trim({ threshold: 10 }).png().toBuffer()
}
const heaven = await toPng(await solidify(await arc(await inkFromLineart(join(here, 'heaven-lineart-source.png'))), W, () => INK), 300)
const hv = await sharp(heaven).metadata()

// both lines at one scale: the first line spans 92% of the print width (owner: bolder, bigger)
const raw = await Promise.all(LINES.map((l) => trimmed(text(l))))
const r0 = await sharp(raw[0]).metadata()
const k = (W * 0.92) / r0.width
const lines = await Promise.all(raw.map(async (b) => {
  const m = await sharp(b).metadata()
  return toPng(await solidify(b, Math.round(m.width * k), () => INK), 300)
}))
const lm = await Promise.all(lines.map((b) => sharp(b).metadata()))

// mark in a pill outline, line weight about 2 mm (owner: bigger logo)
const pillW = Math.round(W * 0.26), pillH = Math.round(W * 0.115), stroke = 24
const pill = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pillW}" height="${pillH}">
  <rect x="${stroke / 2}" y="${stroke / 2}" width="${pillW - stroke}" height="${pillH - stroke}" rx="${(pillH - stroke) / 2}" fill="none" stroke="#fff" stroke-width="${stroke}"/></svg>`)
const markH = Math.round(pillH * 0.68)
const mark = await sharp(join(here, '../../logo/mark-white.png')).resize({ height: markH }).png().toBuffer()
const mm = await sharp(mark).metadata()
const badgeSrc = await sharp(pill).composite([{ input: mark, left: Math.round((pillW - mm.width) / 2), top: Math.round((pillH - markH) / 2) }]).png().toBuffer()
const badge = await toPng(await solidify(badgeSrc, pillW, () => INK), 300)

// stack: HEAVEN, gap, line 1, line 2, badge
const y1 = hv.height + Math.round(W * 0.06)
const y2 = y1 + lm[0].height + Math.round(W * 0.035)
const y3 = y2 + lm[1].height + Math.round(W * 0.045)
const H = y3 + pillH
const centre = (w) => Math.round((W - w) / 2)
const art = await sharp({ create: { width: W, height: H, channels: 4, background: clear } })
  .composite([
    { input: heaven, left: 0, top: 0 },
    { input: lines[0], left: centre(lm[0].width), top: y1 },
    { input: lines[1], left: centre(lm[1].width), top: y2 },
    { input: badge, left: centre(pillW), top: y3 },
  ]).png().toBuffer()
// re-solidify the whole sheet once (composite edges) and save at 300 dpi
await sharp(await toPng(await solidify(art, W, () => INK), 300)).toFile(join(here, 'dtf-back-heaven-black-30cm-300dpi.png'))
console.log('back', W, 'x', H, 'px =', (W / 300 * 2.54).toFixed(1), 'x', (H / 300 * 2.54).toFixed(1), 'cm')
