// 13 Nov 2026 (owner): chest mark is now embroidered and the sleeve script is DTF, swapped from the house format.
// Back print for the pink Final 07 Heaven hoodie: the varsity 07 art in white, with the 07 outline
// recoloured for pink (black, or the original ember for comparison).
// The old varsity file had 92-99% alpha everywhere; solidify forces every pixel solid or transparent.
// Usage: node brand/print/hoodie-07-pink/art.mjs   then   node brand/print/pack.mjs brand/print/hoodie-07-pink
import sharp from 'sharp'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { solidify, toPng } from '../pack.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '../png/varsity-07-hoodie-back.png')
const W = Math.round((26 / 2.54) * 300) // 26 cm at 300 dpi
const WHITE = [255, 255, 255]
for (const [name, rgb] of Object.entries({ black: [17, 17, 17], ember: [248, 88, 36] })) {
  // the source outline is orange (r high, b low); everything else is the white fill
  const art = await toPng(await solidify(SRC, W, (r, g, b) => (r - b > 90 ? rgb : WHITE)), 300)
  await sharp(art).toFile(join(here, `dtf-back-final-07-heaven-${name}-outline-26cm-300dpi.png`))
}
console.log('wrote the black-outline and ember-outline back files')
