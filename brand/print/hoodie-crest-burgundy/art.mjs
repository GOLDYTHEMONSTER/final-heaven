// Back print, washed burgundy: a laurel crest with the real three-star mark in the centre, FINAL HEAVEN
// arched above and 07 under the mark. Wreath: GPT Image 2.6, 2k, job d8c16e0d (wreath-lineart-source.png).
// Mark: brand/logo. Type: Bahnschrift Bold. One ink: cream.
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cmPx, ink, arcType, type, mark, stack, save } from '../art-kit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const W = cmPx(28)
const wreathW = Math.round(W * 0.8)
const pieces = [
  { buf: await arcType('FINAL HEAVEN', Math.round(W * 0.88), { spacing: 0.2, sweep: 95, thicken: 6 }) },
  { buf: await ink(join(here, 'wreath-lineart-source.png'), wreathW, { fatten: 0.6 }), gap: Math.round(W * 0.02) },
]
// the mark and 07 sit inside the wreath: placed relative to the wreath once its box is known
const wreath = pieces[1]
const markBuf = await mark(Math.round(wreathW * 0.34))
const numBuf = await type('07', Math.round(wreathW * 0.12), { spacing: 0.1, thicken: 6 })
pieces.push({ buf: markBuf, over: (m) => wreath.box.top + wreath.box.height * 0.47 - m.height / 2 - wreathW * 0.04 })
pieces.push({ buf: numBuf, over: (m) => wreath.box.top + wreath.box.height * 0.47 + wreathW * 0.17 })
await save(await stack(W, pieces), W, '#EFE7D2', join(here, 'dtf-back-crest-cream-28cm-300dpi.png'))
