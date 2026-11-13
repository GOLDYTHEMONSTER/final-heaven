// Cap embroidery artwork: the Final Heaven mark with a satin outline, in two colourways:
//   standard: black fill, white outline (red cap)
//   inverse:  white fill, black outline (blue cap)
// Writes the embroidery art (transparent PNG, 600 dpi at the stated size), a preview on the cap colour,
// and a mock-up on the owner's photo: centred on the front panel, bottom edge 2 cm above the brim seam.
//
// Usage: node brand/print/cap/build.mjs <standard|inverse> <photo.jpg> <centre x> <brim seam y> <px per mm>
//   red cap:  node brand/print/cap/build.mjs standard red.jpg 868 985 7.5
//   blue cap: node brand/print/cap/build.mjs inverse blue.jpg 745 975 4.4
// HEIGHT_MM=60 changes the mark height (default 55).
import sharp from 'sharp'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [variant = 'standard', photo, cxArg, seamArg, ppmArg] = process.argv.slice(2)
const inverse = variant === 'inverse'
const FILL = inverse ? 'mark-white.png' : 'mark-black.png'
const EDGE = inverse ? 0 : 255             // outline grey level: black or white
const PREVIEW_BG = inverse ? '#1F4FBF' : '#C8161D'

const HEIGHT_MM = Number(process.env.HEIGHT_MM ?? 55) // finished height of the mark itself
const OUTLINE_MM = 1.2                                // satin border width (about 1 mm minimum)
const DPI = 600
const px = (mm) => Math.round((mm / 25.4) * DPI)

const markH = px(HEIGHT_MM)
const pad = px(OUTLINE_MM) + 8
const mark = await sharp(join(here, '../../logo', FILL)).resize({ height: markH }).png().toBuffer()
const { width: mw } = await sharp(mark).metadata()
const W = mw + pad * 2, H = markH + pad * 2

// outline = mark alpha dilated by OUTLINE_MM (blur, then a hard threshold)
const alpha = await sharp(mark).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extractChannel(3).raw().toBuffer()
const blurred = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(px(OUTLINE_MM) / 2).extractChannel(0).raw().toBuffer()
const outline = Buffer.alloc(W * H * 4)
for (let i = 0; i < W * H; i++) {
  outline[i * 4] = outline[i * 4 + 1] = outline[i * 4 + 2] = EDGE
  outline[i * 4 + 3] = blurred[i] > 6 ? 255 : 0
}
const art = await sharp(outline, { raw: { width: W, height: H, channels: 4 } })
  .composite([{ input: mark, left: pad, top: pad }])
  .png().withMetadata({ density: DPI }).toBuffer()
const tag = inverse ? 'white-fill-black-edge' : 'black-fill-white-edge'
await sharp(art).toFile(join(here, `fh-cap-embroidery-${tag}-${HEIGHT_MM}mm-600dpi.png`))

const prev = await sharp({ create: { width: W + 200, height: H + 200, channels: 3, background: PREVIEW_BG } })
  .composite([{ input: art, left: 100, top: 100 }]).png().toBuffer()
await sharp(prev).resize({ height: 900 }).jpeg({ quality: 90 }).toFile(join(here, `art-${tag}.jpg`))

if (photo) {
  const ppm = Number(ppmArg), cx = Number(cxArg), seam = Number(seamArg)
  const small = await sharp(art).resize({ height: Math.round(ppm * (HEIGHT_MM + OUTLINE_MM * 2)) }).toBuffer()
  const sm = await sharp(small).metadata()
  const cy = seam - 20 * ppm - sm.height / 2
  // soft shadow so the stitching sits on the fabric rather than floating
  const shadow = await sharp(small).ensureAlpha().modulate({ brightness: 0 }).blur(Math.max(2, ppm / 2)).linear(0.45, 0).toBuffer()
  await sharp(photo)
    .composite([
      { input: shadow, left: Math.round(cx - sm.width / 2) + 2, top: Math.round(cy - sm.height / 2) + 4, blend: 'multiply' },
      { input: small, left: Math.round(cx - sm.width / 2), top: Math.round(cy - sm.height / 2) },
    ])
    .jpeg({ quality: 90 }).toFile(join(here, `mockup-${tag}.jpg`))
}
console.log(tag, W, 'x', H, 'px =', (W / DPI * 25.4).toFixed(1), 'x', (H / DPI * 25.4).toFixed(1), 'mm')
