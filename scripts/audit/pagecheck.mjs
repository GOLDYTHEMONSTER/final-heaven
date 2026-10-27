// Visits pages at phone and desktop width; reports console errors, failed requests, broken images,
// sideways scroll and page-specific facts; saves a full-page screenshot of each.
// Usage: node pagecheck.mjs <base> <outdir> [cookies.json] path...
import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [base, out, maybeCookies, ...rest] = process.argv.slice(2)
const cookies = maybeCookies?.endsWith('.json') ? JSON.parse(readFileSync(maybeCookies, 'utf8')) : []
const paths = maybeCookies?.endsWith('.json') ? rest : [maybeCookies, ...rest]
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page') } catch {} if (!target) await sleep(200) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const pending = new Map(); let errors = []; let failed = []
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0])
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/realtime\/v1\/websocket/.test(m.params.entry.text)) errors.push(m.params.entry.text)
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !m.params.response.url.includes('_vercel')) failed.push(`${m.params.response.status} ${m.params.response.url.replace(base, '')}`) })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable')
await send('Network.setBlockedURLs', { urls: ['*/api/track*', '*/_vercel/insights*'] })
for (const c of cookies) await send('Network.setCookie', { name: c.name, value: c.value, url: base, path: '/' })

for (const path of paths) {
  for (const [name, w, h, mobile] of [['desktop', 1440, 900, false], ['mobile', 390, 844, true]]) {
    errors = []; failed = []
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile })
    await send('Page.navigate', { url: base + path }); await sleep(7000)
    // Scroll through so lazy images load, then back to the top.
    const height = await ev('document.documentElement.scrollHeight')
    for (let y = 0; y < Math.min(height, 9000); y += h) { await ev(`window.scrollTo(0, ${y})`); await sleep(350) }
    await ev('window.scrollTo(0, 0)'); await sleep(800)
    const facts = await ev(`(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.innerText?.replace(/\\s+/g, ' ').slice(0, 60),
      headings: [...document.querySelectorAll('h2')].map(h => h.innerText.replace(/\\s+/g, ' ')).filter(Boolean).slice(0, 12),
      broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.replace(location.origin, '')).slice(0, 5),
      overflow: document.documentElement.scrollWidth > innerWidth,
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { const j = JSON.parse(s.textContent); return j['@type'] + ':' + (j.offers?.availability ?? '') + ':' + (j.offers?.itemCondition ?? '') } catch { return 'bad' } }),
      ogImage: document.querySelector('meta[property="og:image"]')?.content ?? null,
    }))()`)
    const full = Math.min(await ev('document.documentElement.scrollHeight'), 6000)
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 60, captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: full, scale: mobile ? 0.6 : 0.5 } })
    const file = `${path.replace(/[^a-z0-9]+/gi, '_') || 'home'}-${name}.jpg`
    writeFileSync(join(out, file), Buffer.from(s.result.data, 'base64'))
    console.log(JSON.stringify({ path, view: name, ...facts, errors: [...new Set(errors)].slice(0, 4), failed: [...new Set(failed)].slice(0, 4) }))
  }
}
ws.close(); chrome.kill(); process.exit(0)
