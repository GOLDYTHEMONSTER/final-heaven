// Gallery check on a phone: a real touch swipe moves to the next photo and picks its colour;
// tapping a colour brings its photo back. Also checks the homepage pauses off-screen animations.
// Usage: node gallerycheck.mjs <base> <outdir> <productId>
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [base, out, productId] = process.argv.slice(2)
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page') } catch {} if (!target) await sleep(200) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const pending = new Map(); const errors = []
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0])
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text) })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable')
await send('Network.setBlockedURLs', { urls: ['*/api/track*', '*/_vercel/insights*'] })
// The launch gate would sit over the photos: mark it seen, as a returning visitor.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('fh_launch', 'seen') } catch {}" })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

await send('Page.navigate', { url: `${base}/product/${productId}` }); await sleep(7000)
const state = () => ev(`(() => {
  const t = document.querySelector('[aria-roledescription="carousel"]')
  const pressed = [...document.querySelectorAll('button')].filter(b => /^(Red|Black)$/i.test(b.textContent.trim()) && /bg-final-accent/.test(b.className)).map(b => b.textContent.trim())
  return { photo: t ? Math.round(t.scrollLeft / t.clientWidth) : null, photos: t?.children.length, colour: pressed[0] ?? null,
    chip: [...document.querySelectorAll('span')].find(s => /^(Red|Black)$/i.test(s.textContent.trim()) && s.className.includes('rounded-full bg-final-black/60'))?.textContent ?? null }
})()`)
const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); writeFileSync(join(out, name + '.jpg'), Buffer.from(s.result.data, 'base64')) }
const box = await ev(`(() => { const r = document.querySelector('[aria-roledescription="carousel"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
console.log('loaded', JSON.stringify(await state()))
await shot('gallery-1')

// A real swipe: finger down on the right, drag left, lift.
const y = box.y + box.h / 2
const points = Array.from({ length: 10 }, (_, i) => box.x + box.w * 0.85 - (box.w * 0.7 * i) / 9)
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0], y }] })
for (const x of points.slice(1)) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await sleep(16) }
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await sleep(1500)
console.log('after swipe', JSON.stringify(await state()))
await shot('gallery-2')

// Tap the Red colour: its photo comes back into view.
await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Red')?.click()`); await sleep(1500)
console.log('after tapping Red', JSON.stringify(await state()))

// Thumbnails work even with a colour chosen (the old gallery ignored them).
await ev(`document.querySelectorAll('[aria-label^="Show photo"]')[1]?.click()`); await sleep(1500)
console.log('after thumbnail 2', JSON.stringify(await state()))
console.log(JSON.stringify({ overflow: await ev('document.documentElement.scrollWidth > innerWidth'), consoleErrors: errors }))

// Homepage: the reel and logo pause once scrolled away.
await send('Page.navigate', { url: `${base}/` }); await sleep(6000)
const paused = () => ev(`({ reel: document.querySelector('[data-offscreen]') ? [...document.querySelectorAll('[data-offscreen]')].length : 0 })`)
console.log('home at top', JSON.stringify(await paused()))
await ev('window.scrollTo(0, 3000)'); await sleep(1200)
console.log('home scrolled down', JSON.stringify(await paused()))
ws.close(); chrome.kill(); process.exit(0)
