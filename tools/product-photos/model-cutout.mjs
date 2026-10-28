// On-model shots with text, insets or colour dots over the backdrop: crop to
// 4:5, cut the model out locally, clear the overlay areas, and put her back on a
// plain grey gradient close to a studio backdrop. 1200 × 1500.
//   node tools/product-photos/model-cutout.mjs <in> <out.jpg> <left> <top> <width> <height> [clear x0,y0,x1,y1 ...] [--bg #dadada,#e4e4e5]
// Clear rectangles are in the source photo's pixels (the overlay to remove).
import { resolve } from 'node:path'
import { sharp, cutOut, W, H } from './deps.mjs'

const argv = process.argv.slice(2)
const bgAt = argv.indexOf('--bg')
const [top, bottom] = bgAt >= 0 ? argv.splice(bgAt, 2)[1].split(',') : ['#dadada', '#e4e4e5']
const [src, out, l, t, w, h, ...clears] = argv
if (!src || !out || [l, t, w, h].some((v) => v == null || Number.isNaN(+v))) {
  console.error('Usage: model-cutout.mjs <in> <out.jpg> <left> <top> <width> <height> [clear x0,y0,x1,y1 ...] [--bg top,bottom]')
  process.exit(1)
}
if (resolve(src) === resolve(out)) { console.error('Refusing to overwrite the source photo.'); process.exit(1) }
const [x0, y0, cw, ch] = [+l, +t, +w, +h]
const crop = await sharp(src).extract({ left: x0, top: y0, width: cw, height: ch }).jpeg({ quality: 95 }).toBuffer()
const rgba = await sharp(await cutOut(crop)).ensureAlpha().raw().toBuffer()
for (const c of clears) {
  const [a, b, c2, d] = c.split(',').map(Number)
  for (let y = Math.max(0, b - y0); y < Math.min(ch, d - y0); y++) for (let x = Math.max(0, a - x0); x < Math.min(cw, c2 - x0); x++) rgba[(y * cw + x) * 4 + 3] = 0
}
const person = await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } }).resize(W, H, { kernel: 'lanczos3' }).png().toBuffer()
const bg = Buffer.from(`<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`)
const info = await sharp(bg).composite([{ input: person }]).sharpen({ sigma: 0.5 }).jpeg({ quality: 88, mozjpeg: true }).toFile(out)
console.log(`${out}: ${W}×${H}, ${Math.round(info.size / 1024)} KB`)
