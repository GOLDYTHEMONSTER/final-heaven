// Cuts a generated sticker out of its background along the white border.
// Flood-fills from the image edge through every pixel that isn't near-white (the dark gradient and its glow),
// makes that transparent, then softens the edge by one pixel and trims. Writes <name>-cut.png at 2x size.
// Usage: node brand/print/stickers/characters/cutout.mjs <in.png> [<in.png> ...]
import sharp from 'sharp'

const WHITE = 232 // a pixel at or above this on all channels counts as sticker border

for (const file of process.argv.slice(2)) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const bg = new Uint8Array(w * h)
  const isWhite = (i) => data[i * 4] >= WHITE && data[i * 4 + 1] >= WHITE && data[i * 4 + 2] >= WHITE
  const stack = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  while (stack.length) {
    const i = stack.pop()
    if (bg[i] || isWhite(i)) continue
    bg[i] = 1
    const x = i % w, y = (i / w) | 0
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - w)
    if (y < h - 1) stack.push(i + w)
  }
  // alpha: 0 on background, 255 inside; edge pixels averaged with neighbours for a soft 1 px edge
  const alpha = Buffer.alloc(w * h)
  for (let i = 0; i < w * h; i++) alpha[i] = bg[i] ? 0 : 255
  const soft = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(0.6).extractChannel(0).raw().toBuffer()
  if (soft.length !== w * h) throw new Error(`alpha size ${soft.length}, expected ${w * h}`)
  for (let i = 0; i < w * h; i++) {
    data[i * 4 + 3] = soft[i]
    if (bg[i]) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255 } // keep fringe white, not grey
  }
  const out = file.replace(/\.png$/, '-cut.png')
  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ width: w * Number(process.env.SCALE ?? 2), kernel: 'lanczos3' })
    .png()
    .toFile(out)
  console.log('wrote', out)
}
