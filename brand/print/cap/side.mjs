// Side embroidery for the caps (owner, 10 Nov: "add cursive embroidery to the side of each hat colourway").
// "Final Heaven" in the slim varsity script used on the hoodie sleeves: 6 cm on the side (owner, 11 Nov: smaller,
// towards the back) and 10 cm for the text-only front version, with the same
// fill-plus-satin-edge treatment as the front mark:
//   standard: black fill, white edge   (red cap, and the blue cap's black version)
//   inverse:  white fill, black edge   (the blue cap's white version)
// Writes fh-cap-script-<tag>-<60|100>mm-600dpi.png.  Usage: node brand/print/cap/side.mjs
import sharp from 'sharp'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSleeveScript } from '../pack.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OUTLINE_MM = 0.8, DPI = 600
const WIDTHS_CM = [6, 10] // 6 cm side panel (towards the back), 10 cm for the text-only front
const px = (mm) => Math.round((mm / 25.4) * DPI)
const tmp = mkdtempSync(join(tmpdir(), 'fh-cap-'))

for (const WIDTH_CM of WIDTHS_CM) for (const [tag, fill, edge] of [['black-fill-white-edge', '#111111', 255], ['white-fill-black-edge', '#FFFFFF', 17]]) {
  await makeSleeveScript({ colour: fill, widthCm: WIDTH_CM - (2 * OUTLINE_MM) / 10, file: 'fill.png' }, tmp)
  const script = await sharp(join(tmp, 'fill.png')).png().toBuffer()
  const { width: sw, height: shh } = await sharp(script).metadata()
  const pad = px(OUTLINE_MM) + 6, W = sw + pad * 2, H = shh + pad * 2
  const alpha = await sharp(script).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extractChannel(3).raw().toBuffer()
  const grown = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(px(OUTLINE_MM) / 2).extractChannel(0).raw().toBuffer()
  const out = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = edge; out[i * 4 + 3] = grown[i] > 6 ? 255 : 0 }
  const file = join(here, `fh-cap-script-${tag}-${WIDTH_CM * 10}mm-600dpi.png`)
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).composite([{ input: script, left: pad, top: pad }])
    .png().withMetadata({ density: DPI }).toFile(file)
  console.log(tag, W, 'x', H, 'px =', (W / DPI * 25.4).toFixed(1), 'x', (H / DPI * 25.4).toFixed(1), 'mm')
}
