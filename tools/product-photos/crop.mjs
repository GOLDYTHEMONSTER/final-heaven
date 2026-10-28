// Crop a supplier photo to the store's 4:5 shape, leaving out text, labels,
// colour dots or branded props, and scale it to 1200 × 1500.
//   node tools/product-photos/crop.mjs <in> <out.jpg> <left> <top> <width> <height> [quality]
// Pick width:height = 4:5 (e.g. 640 × 800 from an 800 px square). Never writes over <in>.
import { resolve } from 'node:path'
import { sharp, W, H } from './deps.mjs'

const [src, out, l, t, w, h, q = '88'] = process.argv.slice(2)
if (!src || !out || [l, t, w, h].some((v) => v == null || Number.isNaN(+v))) {
  console.error('Usage: crop.mjs <in> <out.jpg> <left> <top> <width> <height> [quality]')
  process.exit(1)
}
if (resolve(src) === resolve(out)) { console.error('Refusing to overwrite the source photo.'); process.exit(1) }
if (Math.abs(+w / +h - 0.8) > 0.02) console.warn(`note: ${w}×${h} isn't 4:5, it will be stretched`)
const info = await sharp(src).extract({ left: +l, top: +t, width: +w, height: +h })
  .resize(W, H, { kernel: 'lanczos3' }).sharpen({ sigma: 0.6 }).jpeg({ quality: +q, mozjpeg: true }).toFile(out)
console.log(`${out}: ${W}×${H}, ${Math.round(info.size / 1024)} KB${+w < 800 ? ' (upscaled from under 800 px: soft at full size)' : ''}`)
