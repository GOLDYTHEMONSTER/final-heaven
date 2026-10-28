// How a rank frame wraps a 4:5 product image on hover. The whole frame,
// ornaments included, fits inside the card's own image box, so it never
// covers anything around the card. On hover the photo eases back into the
// frame's opening, scaled to fit so the whole product stays in view; a soft
// blurred copy of the photo fills the rest of the opening, and the add button
// moves to the photo's corner. Pure, so the geometry is tested. The frames'
// measurements come from scripts/hype-art.mjs.
import { FRAME_OPENINGS } from './hype-art'

/** Card height over width (the store's 4:5 photos). */
export const CARD_ASPECT = 1.25

export type CardFrame = {
  /** Where the frame art sits in the card box. */
  art: { left: string; top: string; width: string; height: string }
  /** The frame's opening in the card box (filled behind the photo). */
  opening: { left: string; top: string; width: string; height: string }
  /** The photo's move on hover: translate (in % of the card) and scale. */
  photo: { x: string; y: string; scale: number }
  /** Where the add button sits on hover: inside the photo's bottom-right corner (from the card's right and bottom). */
  button: { right: string; bottom: string }
}

export function cardFrame(name: string): CardFrame | null {
  const f = FRAME_OPENINGS[name]
  if (!f) return null
  // Units: card width 1, height CARD_ASPECT. The art (1 × f.aspect, scaled by s) is contained in the card.
  const s = Math.min(1, CARD_ASPECT / f.aspect)
  const left = (1 - s) / 2
  const top = (CARD_ASPECT - f.aspect * s) / 2
  const open = { x: left + f.x * s, y: top + f.y * f.aspect * s, w: f.w * s, h: f.h * f.aspect * s }
  // Fit the opening, centred on it: the whole product stays visible inside the frame.
  const scale = Math.min(open.w, open.h / CARD_ASPECT)
  const cx = open.x + open.w / 2 - 0.5
  const cy = (open.y + open.h / 2) / CARD_ASPECT - 0.5
  const p = (n: number) => `${(n * 100).toFixed(3)}%`
  const k = Math.round(scale * 10000) / 10000
  return {
    art: { left: p(left), top: p(top / CARD_ASPECT), width: p(s), height: p((f.aspect * s) / CARD_ASPECT) },
    opening: { left: p(open.x), top: p(open.y / CARD_ASPECT), width: p(open.w), height: p(open.h / CARD_ASPECT) },
    photo: { x: p(cx), y: p(cy), scale: k },
    button: { right: p(0.5 - cx - k / 2 + 0.03), bottom: p(0.5 - cy - k / 2 + 0.03) },
  }
}
