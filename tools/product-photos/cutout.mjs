// Small products (cases, jewellery, gadgets): cut the item out locally and put
// it on the store background (#ECEAE6) with a soft shadow, 1200 × 1500.
//   node tools/product-photos/cutout.mjs <jobs.json> [only-name]
// jobs: [{ in, out, crop: [x0, y0, x1, y1], seed: [x, y], cut?: [[x0, y0, x1, y1]], poly?: [[[x, y], ...]], gap?, maxScale? }]
//   crop and seed in the source photo's pixels. The item is the solid part under the
//   seed plus anything within `gap` px (clips, straps, charms). `cut` rectangles and
//   `poly` outlines are left out (fingers, a neighbouring item, a shadow).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sharp, cutOut, W, H } from './deps.mjs'

const [jobsFile, only] = process.argv.slice(2)
const BG = { r: 0xec, g: 0xea, b: 0xe6 }
const PAD = 150

for (const job of JSON.parse(readFileSync(jobsFile, 'utf8'))) {
  if (only && !job.out.includes(only)) continue
  if (resolve(job.in) === resolve(job.out)) { console.log(`${job.out}: refusing to overwrite the source`); continue }
  const [x0, y0, x1, y1] = job.crop
  const width = x1 - x0, height = y1 - y0, n = width * height
  const crop = await sharp(job.in).extract({ left: x0, top: y0, width, height }).jpeg({ quality: 95 }).toBuffer()
  const rgba = await sharp(await cutOut(crop)).ensureAlpha().raw().toBuffer()
  const at = (x, y) => y * width + x
  for (const [cx0, cy0, cx1, cy1] of job.cut ?? []) {
    for (let y = Math.max(0, cy0 - y0); y < Math.min(height, cy1 - y0); y++) for (let x = Math.max(0, cx0 - x0); x < Math.min(width, cx1 - x0); x++) rgba[at(x, y) * 4 + 3] = 0
  }
  for (const poly of job.poly ?? []) {
    const inside = (px, py) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [ax, ay] = poly[a], [bx, by] = poly[b]; if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) c = !c } return c }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (inside(x + x0, y + y0)) rgba[at(x, y) * 4 + 3] = 0
  }

  // The item: the solid part under the seed (or the nearest solid pixel), then anything within `gap` px.
  const solid = (i) => rgba[i * 4 + 3] > 96
  const keep = new Uint8Array(n), stack = []
  const step = (j, fn) => { const x = j % width; for (const k of [j - 1, j + 1, j - width, j + width]) if (k >= 0 && k < n && Math.abs((k % width) - x) <= 1) fn(k) }
  const grow = () => { while (stack.length) step(stack.pop(), (k) => { if (!keep[k] && solid(k)) { keep[k] = 1; stack.push(k) } }) }
  let seed = -1
  for (let r = 0; r <= 60 && seed < 0; r += 2) for (let dy = -r; dy <= r && seed < 0; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
    const x = job.seed[0] - x0 + dx, y = job.seed[1] - y0 + dy
    if (x >= 0 && y >= 0 && x < width && y < height && solid(at(x, y))) { seed = at(x, y); break }
  }
  if (seed < 0) { console.log(`${job.out}: nothing solid near the seed point, skipped`); continue }
  keep[seed] = 1; stack.push(seed); grow()
  let reach = keep.slice()
  for (let s = 0; s < (job.gap ?? 12); s++) { const next = reach.slice(); for (let i = 0; i < n; i++) if (reach[i]) step(i, (k) => { next[k] = 1 }); reach = next }
  for (let i = 0; i < n; i++) if (reach[i] && !keep[i] && solid(i)) { keep[i] = 1; stack.push(i) }
  grow()

  let bx0 = width, by0 = height, bx1 = 0, by1 = 0
  for (let i = 0; i < n; i++) {
    const near = keep[i] || (rgba[i * 4 + 3] > 0 && reach[i])
    if (!near) { rgba[i * 4 + 3] = 0; continue }
    if (rgba[i * 4 + 3] > 24) { const x = i % width, y = (i / width) | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y) }
  }
  const item = sharp(await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer()).extract({ left: bx0, top: by0, width: bx1 - bx0 + 1, height: by1 - by0 + 1 })
  const scale = Math.min((W - 2 * PAD) / (bx1 - bx0 + 1), (H - 2 * PAD) / (by1 - by0 + 1), job.maxScale ?? 3)
  const pw = Math.round((bx1 - bx0 + 1) * scale), ph = Math.round((by1 - by0 + 1) * scale)
  const fitted = await item.resize(pw, ph, { kernel: 'lanczos3' }).png().toBuffer()
  const left = Math.round((W - pw) / 2), top = Math.round((H - ph) / 2)
  const alpha = await sharp(fitted).extractChannel(3).toBuffer()
  const shadow = await sharp({ create: { width: pw, height: ph, channels: 3, background: { r: 60, g: 55, b: 50 } } })
    .joinChannel(await sharp(alpha).linear(0.22, 0).toBuffer()).png().toBuffer()
  const blurred = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow, left: left + 6, top: top + 14 }]).blur(14).png().toBuffer()
  await sharp({ create: { width: W, height: H, channels: 3, background: BG } })
    .composite([{ input: blurred }, { input: fitted, left, top }])
    .jpeg({ quality: 90, mozjpeg: true }).toFile(job.out)
  console.log(`${job.out}: item ${bx1 - bx0 + 1}×${by1 - by0 + 1}, scale ${scale.toFixed(2)}${scale > 1.6 ? ' (enlarged a lot: check sharpness)' : ''}`)
}
