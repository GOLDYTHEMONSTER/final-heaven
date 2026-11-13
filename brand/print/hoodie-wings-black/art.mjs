// Back print, washed black: engraved angel wings with a halo, FINAL HEAVEN set wide underneath.
// Wings: GPT Image 2.6, 2k, job 7d4c3b9d (wings-lineart-source.png). Type: Bahnschrift Bold. One ink: white.
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cmPx, ink, type, stack, save } from '../art-kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const W = cmPx(30)
const art = await stack(W, [
  { buf: await ink(join(here, 'wings-lineart-source.png'), W, { fatten: 0.55 }) },
  { buf: await type('FINAL HEAVEN', Math.round(W * 0.74), { spacing: 0.32, thicken: 6 }), gap: Math.round(W * 0.07) },
])
await save(art, W, '#FFFFFF', join(here, 'dtf-back-wings-white-30cm-300dpi.png'))
