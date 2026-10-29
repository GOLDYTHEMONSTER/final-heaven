// The neon brand mark as an animated GIF for emails (email clients can't run
// the website's CSS animation; most play GIFs, Outlook shows the first frame).
// Same recipe as components/ui/NeonMark: the logo as a mask over a drifting
// ember → pink → cyan gradient, a blurred glow behind, a white-hot core.
//   node tools/email/neon-gif.mjs [size=176] [out=public/brand/email/neon-mark.gif]
// Libraries come from the photo tools folder (tools/product-photos/setup.mjs, plus gifenc).
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { DEPS, sharp } from '../product-photos/deps.mjs'

const { GIFEncoder, quantize, applyPalette } = createRequire(join(DEPS, 'node_modules', 'noop.js'))('gifenc')
const [size = '176', out = 'public/brand/email/neon-mark.gif'] = process.argv.slice(2)
const S = Number(size)
const BG = { r: 10, g: 10, b: 11 } // the store's --bg, so the GIF sits seamlessly in the dark header
const FRAMES = 24
const DELAY = 125 // ms per frame: a ~3 s colour drift, there and back, so the loop has no seam

// The logo, fitted with room for the glow to spill.
const LOGO = 'public/brand/logo-white.png'
const inner = Math.round(S * 0.62)
const logo = await sharp(LOGO).resize({ height: inner, width: inner, fit: 'inside' }).ensureAlpha().toBuffer({ resolveWithObject: true })
const lw = logo.info.width, lh = logo.info.height
const left = Math.round((S - lw) / 2), top = Math.round((S - lh) / 2)
const mask = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: logo.data, left, top }]).png().toBuffer()

const tube = async (phase) => {
  // A wide diagonal gradient (3.2× the canvas) slid across the mark, like the site's background-position drift.
  const W = S * 3.2, off = -phase * (W - S)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs>
<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${off}" y1="${S * 0.3}" x2="${off + W}" y2="${S * 0.7}">
<stop offset="0" stop-color="rgb(232,97,60)"/><stop offset="0.3" stop-color="rgb(255,61,154)"/>
<stop offset="0.55" stop-color="rgb(56,214,255)"/><stop offset="0.78" stop-color="rgb(255,61,154)"/>
<stop offset="1" stop-color="rgb(232,97,60)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/></svg>`
  return sharp(Buffer.from(svg)).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}
const core = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 255, g: 248, b: 244, alpha: 0.35 } } })
  .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()

const gif = GIFEncoder()
for (let i = 0; i < FRAMES; i++) {
  // Ping-pong with an ease, so frame 0 and the last frame meet smoothly.
  const t = i / FRAMES, phase = (1 - Math.cos(t * 2 * Math.PI)) / 2
  const breathe = 0.85 + 0.15 * Math.sin(t * 2 * Math.PI) // the glow swells a little
  const lit = await tube(phase)
  const glow = await sharp(lit).blur(Math.max(4, S / 18)).modulate({ saturation: 1.6 })
    .composite([{ input: Buffer.from([255, 255, 255, Math.round(255 * breathe)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
    .png().toBuffer()
  const { data } = await sharp({ create: { width: S, height: S, channels: 4, background: { ...BG, alpha: 1 } } })
    .composite([{ input: glow }, { input: glow }, { input: lit }, { input: core }]).raw().toBuffer({ resolveWithObject: true })
  const palette = quantize(data, 256)
  gif.writeFrame(applyPalette(data, palette), S, S, { palette, delay: DELAY })
}
gif.finish()
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, gif.bytes())
console.log(`${out}: ${S}×${S}, ${FRAMES} frames, ${Math.round(gif.bytes().length / 1024)} KB`)
