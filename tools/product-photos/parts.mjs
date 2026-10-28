// Lists the separate items a cut-out finds in each photo (area and box), so a
// photo with several products can be cropped one item at a time with cutout.mjs.
//   node tools/product-photos/parts.mjs <dir> <file> [file ...]
import { join } from 'node:path'
import { sharp, cutOut } from './deps.mjs'

const [dir, ...files] = process.argv.slice(2)
for (const f of files) {
  const buf = await sharp(join(dir, f)).jpeg().toBuffer()
  const { width, height } = await sharp(buf).metadata()
  const a = await sharp(await cutOut(buf)).ensureAlpha().extractChannel(3).raw().toBuffer()
  const n = width * height, label = new Int32Array(n).fill(-1), parts = [], stack = []
  for (let i = 0; i < n; i++) {
    if (label[i] !== -1 || a[i] <= 96) continue
    const p = { area: 0, x0: width, y0: height, x1: 0, y1: 0 }
    label[i] = parts.length; stack.push(i)
    while (stack.length) {
      const j = stack.pop(), x = j % width, y = (j / width) | 0
      p.area++; p.x0 = Math.min(p.x0, x); p.x1 = Math.max(p.x1, x); p.y0 = Math.min(p.y0, y); p.y1 = Math.max(p.y1, y)
      for (const k of [j - 1, j + 1, j - width, j + width]) if (k >= 0 && k < n && label[k] === -1 && a[k] > 96 && Math.abs((k % width) - x) <= 1) { label[k] = parts.length; stack.push(k) }
    }
    parts.push(p)
  }
  console.log(`${f} ${width}x${height}`)
  for (const p of parts.filter((p) => p.area >= 0.003 * n).sort((x, y) => y.area - x.area)) console.log(`  ${(100 * p.area / n).toFixed(1)}% [${p.x0},${p.y0} – ${p.x1},${p.y1}]`)
}
