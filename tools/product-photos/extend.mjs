// A landscape or square lifestyle shot that won't crop to 4:5 without losing
// the product: keep a horizontal band (e.g. below a logo row), and extend it to
// 1200 × 1500 with a blurred fill and feathered edges.
//   node tools/product-photos/extend.mjs <in> <out.jpg> <top> <height>
import { resolve } from 'node:path'
import { sharp, W, H } from './deps.mjs'

const [src, out, t, h] = process.argv.slice(2)
if (!src || !out || [t, h].some((v) => v == null || Number.isNaN(+v))) { console.error('Usage: extend.mjs <in> <out.jpg> <top> <height>'); process.exit(1) }
if (resolve(src) === resolve(out)) { console.error('Refusing to overwrite the source photo.'); process.exit(1) }
const meta = await sharp(src).metadata()
const band = await sharp(src).extract({ left: 0, top: +t, width: meta.width, height: +h }).resize({ width: W }).toBuffer()
const bh = (await sharp(band).metadata()).height
const fill = await sharp(band).resize(W, H, { fit: 'cover' }).blur(40).modulate({ brightness: 0.7 }).toBuffer()
const fade = Math.round(bh * 0.1)
const mask = Buffer.from(`<svg width="${W}" height="${bh}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${fade / bh}" stop-color="#fff"/>
<stop offset="${1 - fade / bh}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${bh}" fill="url(#g)"/></svg>`)
const feathered = await sharp(band).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
const info = await sharp(fill).composite([{ input: feathered, left: 0, top: Math.round((H - bh) / 2) }]).jpeg({ quality: 88, mozjpeg: true }).toFile(out)
console.log(`${out}: ${W}×${H}, ${Math.round(info.size / 1024)} KB`)
