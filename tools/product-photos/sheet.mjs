// A contact sheet of finished photos side by side, to look them over (and send
// to the owner) before saving a draft.
//   node tools/product-photos/sheet.mjs <out.jpg> <photo> [photo ...]
import { sharp } from './deps.mjs'

const [out, ...files] = process.argv.slice(2)
if (!out || !files.length) { console.error('Usage: sheet.mjs <out.jpg> <photo> [photo ...]'); process.exit(1) }
const tiles = await Promise.all(files.map((f) => sharp(f).resize(480, 600).toBuffer()))
await sharp({ create: { width: 480 * tiles.length + 20 * (tiles.length - 1), height: 600, channels: 3, background: '#fff' } })
  .composite(tiles.map((input, i) => ({ input, left: i * 500, top: 0 }))).jpeg().toFile(out)
console.log(`${out}: ${files.length} photos`)
