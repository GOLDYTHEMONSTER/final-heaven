// Rank frames on product cards (lib/hype-frames): inside the card, around the photo.
import { describe, expect, it } from 'vitest'
import { cardFrame } from '@/lib/hype-frames'
import { FRAME_OPENINGS } from '@/lib/hype-art'

const n = (p: string) => Number(p.replace('%', ''))

describe('card frame', () => {
  it('has geometry for the three rank frames and the nine discovery frames', () => {
    for (const name of ['elite', 'iconic', 'legendary', 'first-find', 'wide-eyes', 'deep-dive', 'hidden-gem', 'taste-expanding', 'heat-seeker', 'curator', 'rare-sight', 'hunt-complete']) {
      expect(FRAME_OPENINGS[name], name).toBeDefined()
    }
  })

  it('keeps the whole frame inside the card, so nothing around it is covered', () => {
    for (const name of Object.keys(FRAME_OPENINGS)) {
      const { art } = cardFrame(name)!
      const [l, t, w, h] = [art.left, art.top, art.width, art.height].map(n)
      expect(l, name).toBeGreaterThanOrEqual(-0.001)
      expect(t, name).toBeGreaterThanOrEqual(-0.001)
      expect(l + w, name).toBeLessThanOrEqual(100.001)
      expect(t + h, name).toBeLessThanOrEqual(100.001)
    }
  })

  it('eases the photo back into the opening without losing the product', () => {
    for (const name of Object.keys(FRAME_OPENINGS)) {
      const { photo } = cardFrame(name)!
      expect(photo.scale, name).toBeGreaterThan(0.6)
      expect(photo.scale, name).toBeLessThan(1)
      expect(Math.abs(n(photo.x)), name).toBeLessThan(3) // centred left to right
    }
  })

  it('has nothing for an unknown frame', () => {
    expect(cardFrame('nope')).toBeNull()
  })
})
