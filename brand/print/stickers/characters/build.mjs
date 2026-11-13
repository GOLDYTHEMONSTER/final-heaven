// Builds the print-ready character stickers: upscales each drawing 2x, composites the real logo files
// at full sharpness, then cuts the sticker out along its white border (cutout.mjs, no extra scaling).
// Usage: node brand/print/stickers/characters/build.mjs
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const logo = (f) => join(here, '../../../logo', f)
const S = 2 // upscale factor; positions below are in the 880 px source's coordinates

// size: { w } or { h } in source px; centred on (cx, cy)
const place = async (file, cx, cy, size) => {
  const buf = await sharp(logo(file)).resize(size.w ? { width: Math.round(size.w * S) } : { height: Math.round(size.h * S) }).toBuffer()
  const m = await sharp(buf).metadata()
  return { input: buf, left: Math.round(cx * S - m.width / 2), top: Math.round(cy * S - m.height / 2) }
}

const stickers = {
  'c1-tee-guy': ['c1-tee-guy.png', [
    ['mark-white.png', 332, 385, { h: 58 }],            // hoodie chest
    ['mark-black.png', 615, 425, { h: 52 }],            // tee
    ['wordmark-black.png', 615, 482, { w: 168 }],
  ]],
  'c2-braids-girl': ['c2-braids-girl-v2.png', [
    ['mark-white.png', 452, 318, { h: 34 }],            // top
    ['mark-white.png', 230, 785, { h: 50 }],            // bag front
    ['wordmark-white.png', 230, 840, { w: 124 }],
  ]],
  'c3-halo-kid': ['c3-halo-kid-v2.png', [
    ['mark-white.png', 440, 600, { h: 72 }],            // hoodie chest
  ]],
}

for (const [name, [src, layers]] of Object.entries(stickers)) {
  const base = await sharp(join(here, src)).metadata()
  const comps = await Promise.all(layers.map(([f, x, y, size]) => place(f, x, y, size)))
  const out = join(here, `${name}-branded.png`)
  await sharp(join(here, src)).resize({ width: base.width * S, kernel: 'lanczos3' }).composite(comps).png().toFile(out)
  execFileSync('node', [join(here, 'cutout.mjs'), out], { stdio: 'inherit', env: { ...process.env, SCALE: '1' } })
}
