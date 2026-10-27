// FH · TX motion graphics: shared helpers for the video compositions.
// Everything is a pure function of time and a seed, so a render is the same every time
// and any frame can be drawn on its own (render.mjs jumps straight to each one).
// Rule from the plan: no more than three full-screen flashes a second.
window.FX = (() => {
  const BPM = 120
  const BEAT = 60 / BPM

  /** Seeded random numbers (mulberry32): the same seed gives the same "random" glitch. */
  function rng(seed) {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
  /** Progress through [a, b] as 0..1. */
  const seg = (t, a, b) => clamp((t - a) / (b - a))
  const easeOut = (p) => 1 - Math.pow(1 - p, 3)
  const easeIn = (p) => p * p * p
  /** True for the n frames starting at time `at` (a glitch hit lasting a couple of frames). */
  const hit = (t, at, frames = 2, fps = 30) => t >= at && t < at + frames / fps
  /** The frame number at 30 fps, used to seed per-frame noise. */
  const frame = (t) => Math.round(t * 30)

  /** TV static into a small canvas (scaled up with pixelated rendering for chunky grain). */
  function staticNoise(canvas, seed, level = 1) {
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(canvas.width, canvas.height)
    const r = rng(seed)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255 * level
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }

  /**
   * Torn bands: each element in `layers` is a copy of the picture; each gets a thin
   * horizontal slice and a sideways shove. amount 0 hides them.
   */
  function tears(layers, seed, amount) {
    const r = rng(seed)
    layers.forEach((el) => {
      if (amount <= 0) { el.style.visibility = 'hidden'; return }
      const top = r() * 80 + 5
      const h = (r() * 6 + 1.5) * amount
      el.style.visibility = 'visible'
      el.style.clipPath = `inset(${top}% 0 ${Math.max(0, 100 - top - h)}% 0)`
      el.style.transform = `translateX(${(r() - 0.5) * 260 * amount}px)`
    })
  }

  /** "00:00:SS:FF" broadcast timecode. */
  function timecode(t, fps = 30) {
    const s = Math.floor(t)
    const f = Math.floor((t - s) * fps)
    const pad = (n) => String(n).padStart(2, '0')
    return `00:00:${pad(s)}:${pad(f)}`
  }

  /** Resolves once the fonts and every <img> on the page have loaded. */
  function ready() {
    const imgs = [...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r })))
    return Promise.all([document.fonts.ready, ...imgs])
  }

  return { BPM, BEAT, rng, clamp, seg, easeOut, easeIn, hit, frame, staticNoise, tears, timecode, ready }
})()
