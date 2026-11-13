// Back print, washed olive: woodcut heaven gates in the clouds, FINAL HEAVEN arched over the top.
// Gates: GPT Image 2.6, 2k, job 702707f1 (gates-lineart-source.png). Type: Bahnschrift Bold on an arc. One ink: cream.
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cmPx, ink, arcType, stack, save } from '../art-kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const W = cmPx(28)
const art = await stack(W, [
  { buf: await arcType('FINAL HEAVEN', W, { spacing: 0.22, sweep: 95, thicken: 6 }) },
  { buf: await ink(join(here, 'gates-lineart-source.png'), Math.round(W * 0.74), { fatten: 0.6 }), gap: Math.round(W * 0.03) },
])
await save(art, W, '#EFE7D2', join(here, 'dtf-back-gates-cream-28cm-300dpi.png'))
