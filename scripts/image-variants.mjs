// Makes the WebP copies lib/images.ts serves: every photo in public/products,
// drops and editorial at each width in IMAGE_WIDTHS (never upscaled). Existing
// copies newer than their photo are kept. Run with `npm run images`.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const WIDTHS = [640, 1200] // keep in step with IMAGE_WIDTHS in lib/images.ts
const ROOTS = ['public/products', 'public/drops', 'public/editorial']
const PHOTO = /\.(jpe?g|png)$/i
const CARD_BUDGET = 80 * 1024

const photos = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? photos(path) : PHOTO.test(name) ? [path] : []
})

let made = 0
for (const photo of ROOTS.flatMap(photos)) {
  const changed = statSync(photo).mtimeMs
  for (const width of WIDTHS) {
    const out = photo.replace(PHOTO, `-${width}.webp`)
    try { if (statSync(out).mtimeMs >= changed) continue } catch {}
    // Card-sized copies stay within the 80 KB budget: busy photos get a lower quality, never below 60.
    for (const quality of width === 640 ? [78, 70, 62, 60] : [78]) {
      const { size } = await sharp(photo).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(out)
      if (size <= CARD_BUDGET) break
    }
    made++
  }
}
console.log(`${made} image copies made`)
