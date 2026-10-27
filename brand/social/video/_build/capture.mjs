// Records the real store as a phone screen, frame by frame, for the browsing clips.
// Each shot (05-browse/shots.mjs) gives a URL, a length, a per-frame script (scroll and swipe
// positions as a function of t) and taps. Taps are real clicks; after one, the clock stops
// until the page settles, and the moment is recorded as a cut so the edit can put a glitch there.
// The viewport is 405 × 720 CSS px at 8/3 density, so every screenshot is exactly 1080 × 1920.
// Browsing only: analytics are blocked, nothing is bought, nobody signs in.
//
// Usage: node brand/social/video/_build/capture.mjs <base url> <shots.mjs> <out dir> [shot names...]
// Writes <out dir>/<shot>/0000.jpg… and <out dir>/<shot>/meta.json ({ fps, frames, taps, swipes, cuts }).
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [base, shotsFile, outDir, ...only] = process.argv.slice(2)
const shots = (await import(pathToFileURL(resolve(shotsFile)).href)).default
const FPS = 30
const W = 405, H = 720, DPR = 8 / 3
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--force-color-profile=srgb', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' })
let target
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page') } catch {}
  if (!target) await sleep(200)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0])
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value

await send('Runtime.enable')
await send('Page.enable')
await send('Network.enable')
await send('Network.setBlockedURLs', { urls: ['*/api/track*', '*/_vercel/insights*', '*/_vercel/speed-insights*'] })
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Animation.enable')

/** Loads a page, scrolls through it once so lazy images arrive, and returns to the top. */
async function open(url) {
  await send('Page.navigate', { url })
  await waitForLoad()
}
async function waitForLoad() {
  for (let i = 0; i < 100 && (await evaluate('document.readyState')) !== 'complete'; i++) await sleep(100)
  await sleep(1500)
  await evaluate(`(async () => {
    document.documentElement.style.scrollBehavior = 'auto'
    const h = document.documentElement.scrollHeight
    for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
    window.scrollTo(0, 0)
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000) })))
  })()`)
  await sleep(600)
}

/** Centre of the element an expression returns, in CSS px of the viewport; null if it's missing or off-screen. */
async function centreOf(find) {
  return evaluate(`(() => { const el = (${find}); if (!el) return null; const r = el.getBoundingClientRect(); const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; return c.y > 0 && c.y < innerHeight ? c : null })()`)
}

for (const [name, shot] of Object.entries(shots)) {
  if (only.length && !only.includes(name)) continue
  const dir = join(outDir, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  await open(new URL(shot.url, base).href)
  if (shot.setup) await evaluate(shot.setup)
  // A shot can slow the page's own CSS animations (the logo, the reel) so they look closer to full
  // speed in the cut. Off by default: slowed, Framer Motion entrances never finish (the cart rows stay invisible).
  await send('Animation.setPlaybackRate', { playbackRate: shot.playbackRate ?? 1 })

  const total = Math.round(shot.seconds * FPS)
  const meta = { fps: FPS, frames: total, taps: [], swipes: shot.swipes ?? [], cuts: [] }
  const taps = [...(shot.taps ?? [])].sort((a, b) => a.at - b.at)
  for (let f = 0; f < total; f++) {
    const t = f / FPS
    // Scroll first, so a tap lands (and is drawn) where the element is on this frame.
    if (shot.frame) await evaluate(`(() => { const t = ${t}; ${shot.frame} })()`)
    while (taps.length && taps[0].at <= t) {
      const tap = taps.shift()
      const p = await centreOf(tap.find)
      if (!p) { console.warn(`${name}: nothing on screen to tap at ${tap.at}s (${tap.find})`); continue }
      meta.taps.push({ at: t, x: p.x * DPR, y: p.y * DPR })
      const before = await evaluate('location.href')
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] })
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await sleep(tap.settle ?? 500)
      if ((await evaluate('location.href')) !== before) {
        await waitForLoad()
        if (tap.after) await evaluate(tap.after)
        meta.cuts.push(t)
      }
    }
    if (shot.frame) await evaluate(`(() => { const t = ${t}; ${shot.frame} })()`)
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true })
    writeFileSync(join(dir, `${String(f).padStart(4, '0')}.jpg`), Buffer.from(s.result.data, 'base64'))
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1))
  console.log(`${name}: ${total} frames, ${meta.taps.length} taps, ${meta.cuts.length} cuts`)
}
if (errors.length) console.log('page errors:', [...new Set(errors)].join(' | '))
ws.close(); chrome.kill()
