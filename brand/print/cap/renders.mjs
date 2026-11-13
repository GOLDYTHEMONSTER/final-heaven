// Cap renders: clean studio shots of the red and royal blue caps with the real embroidery files laid on.
//   front       the 55 mm three-star mark, front centre, 2 cm above the brim
//   text-front  the 100 mm "Final Heaven" script instead of the mark (owner, 11 Nov: "one with just text in front")
//   side        side profile: the mark wrapping round the front, and the 60 mm script on the side panel,
//               towards the back (owner, 11 Nov: "smaller and towards the back")
// Blanks: GPT Image 2.6 2k renders of the owner's caps with the brim sticker removed (renders/blank-*.png).
// Designs are wrapped round the crown: each row of the crown is read from the photo's silhouette and treated
// as a circle, so the art foreshortens the way stitching on a curved panel does.
// Usage: node brand/print/cap/renders.mjs
import sharp from 'sharp'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lay } from '../pack.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'fh-cap-r-'))
const SLOPE = Math.tan((18 * Math.PI) / 180)
const R_CM = 9.5 // crown radius of an adult cap, used to turn the silhouette into a scale

// per blank: brim seam y at the front centre, the band (crown bottom) y under the side script,
// the angle of the front centre from the camera (0 = facing it, -90 = left silhouette)
const BLANK = {
  'red-front': { seam: 1308, front: 0 },
  'blue-front': { seam: 1290, front: 0 },
  'red-profile': { seam: 1352, band: 1446, front: -66 },
  'blue-profile': { seam: 1352, band: 1446, front: -66 },
}

const load = async (f) => sharp(join(here, 'renders', f)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const save = (p, f) => sharp(p.data, { raw: { width: p.info.width, height: p.info.height, channels: 3 } }).jpeg({ quality: 92 }).toFile(join(here, 'renders', f))

// left and right edge of the cap on each row (anything far from the backdrop colour)
function silhouette({ data, info }) {
  const bg = [0, 1, 2].map((k) => data[(20 * info.width + 20) * 3 + k])
  const rows = []
  for (let y = 0; y < info.height; y++) {
    let l = -1, r = -1
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 3
      if (Math.abs(data[p] - bg[0]) + Math.abs(data[p + 1] - bg[1]) + Math.abs(data[p + 2] - bg[2]) > 60) { if (l < 0) l = x; r = x }
    }
    rows.push(l < 0 ? null : { a: (l + r) / 2, R: (r - l) / 2, l })
  }
  return rows
}

// wrap a design round the crown. theta: angle of the design's centre (deg); bottom: y of its lowest row.
// The crown is measured on the row at the bottom of the design (rows above it narrow towards the button,
// and the design follows that taper).
async function wrap(photo, rows, file, { theta, widthCm, bottom, ppcm, limit }) {
  const w = Math.round(widthCm * ppcm)
  const { data: d, info: di } = await sharp(file).resize({ width: w, kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const h = di.height, top = Math.round(bottom - h)
  // one circle for the whole design (the crown at its bottom row, measured above the brim), leaned back with the
  // front slope (crown panels lean back about 18 deg), in proportion to how far round the front the design sits. Pixels past the cap's edge are clipped.
  const base = rows[Math.min(Math.round(bottom), limit)], t0 = (theta * Math.PI) / 180
  const lean = Math.max(0, -Math.sin(t0))
  const rowAt = (y) => ({ a: base.a + (bottom - y) * SLOPE * lean, R: base.R, l: rows[y].l })
  // radians per cm on a row: the crown tapers towards the button, so its radius shrinks with the silhouette
  const k = (row) => base.R / row.R / R_CM
  let x0 = Infinity, x1 = -Infinity
  for (let v = 0; v < h; v++) {
    const row = rowAt(top + v)
    for (const s of [-w / 2, w / 2]) { const x = row.a + row.R * Math.sin(t0 + (s / ppcm) * k(row)); x0 = Math.min(x0, x); x1 = Math.max(x1, x) }
  }
  x0 = Math.floor(x0) - 1; x1 = Math.ceil(x1) + 1
  const W = x1 - x0, out = Buffer.alloc(W * h * 4)
  for (let v = 0; v < h; v++) {
    const row = rowAt(top + v)
    for (let X = 0; X < W; X++) {
      const sn = (x0 + X - row.a) / row.R
      if (sn <= -1 || sn >= 1 || x0 + X < row.l + 3) continue
      const s = ((Math.asin(sn) - t0) / k(row)) * ppcm + w / 2 // screen x -> column of the flat design
      const u = Math.floor(s), f = s - u
      if (u < 0 || u >= w - 1) continue
      for (let c = 0; c < 4; c++) out[(v * W + X) * 4 + c] = d[(v * w + u) * 4 + c] * (1 - f) + d[(v * w + u + 1) * 4 + c] * f
    }
  }
  const warped = join(tmp, 'warp.png')
  await sharp(out, { raw: { width: W, height: h, channels: 4 } }).png().toFile(warped)
  await lay(photo, warped, { cx: x0 + W / 2, top, widthCm: W / ppcm, stitch: true }, ppcm)
}

const colourways = [
  { name: 'red', tag: 'black-fill-white-edge' },
  { name: 'blue', tag: 'black-fill-white-edge' },
  { name: 'blue', tag: 'white-fill-black-edge' },
]
const mark = (tag) => join(here, `fh-cap-embroidery-${tag}-55mm-600dpi.png`)
const script = (tag, mm) => join(here, `fh-cap-script-${tag}-${mm}mm-600dpi.png`)
const cm = async (f) => (await sharp(f).metadata()).width / 600 * 2.54

for (const { name, tag } of colourways) {
  for (const view of ['front', 'text-front', 'side']) {
    const key = `${name}-${view === 'side' ? 'profile' : 'front'}`, b = BLANK[key]
    const photo = await load(`blank-${key}.png`), rows = silhouette(photo)
    const limit = b.seam - 40, ppcm = rows[limit].R / R_CM
    if (view === 'front') {
      await wrap(photo, rows, mark(tag), { theta: 0, widthCm: await cm(mark(tag)), bottom: b.seam - 2 * ppcm, ppcm, limit })
    } else if (view === 'text-front') {
      await wrap(photo, rows, script(tag, 100), { theta: 0, widthCm: await cm(script(tag, 100)), bottom: b.seam - 3.5 * ppcm, ppcm, limit })
    } else {
      await wrap(photo, rows, mark(tag), { theta: b.front, widthCm: await cm(mark(tag)), bottom: b.seam - 2 * ppcm, ppcm, limit })
      // back half of the side panel, clear of the seam to the rear panel and the strap opening
      await wrap(photo, rows, script(tag, 60), { theta: b.front + 95, widthCm: await cm(script(tag, 60)), bottom: b.band - 1.5 * ppcm, ppcm, limit })
    }
    await save(photo, `cap-${name}-${tag}-${view}.jpg`)
    console.log('wrote', name, tag, view, 'ppcm', ppcm.toFixed(1))
  }
}
