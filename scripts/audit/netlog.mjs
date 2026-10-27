// Loads a page on a desktop viewport and reports what it downloads.
// Usage: node scripts/audit/netlog.mjs <url> [wait ms, default 15000]
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [url, waitMs = '15000'] = process.argv.slice(2)
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page') } catch {} if (!target) await sleep(200) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const pending = new Map(); const reqs = new Map(); let loadAt = 0; const t0 = Date.now()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Network.requestWillBeSent') reqs.set(m.params.requestId, { url: m.params.request.url, type: m.params.type, start: m.params.timestamp })
  if (m.method === 'Network.responseReceived') { const r = reqs.get(m.params.requestId); if (r) { r.mime = m.params.response.mimeType; r.status = m.params.response.status } }
  if (m.method === 'Network.loadingFinished') { const r = reqs.get(m.params.requestId); if (r) { r.bytes = m.params.encodedDataLength; r.end = m.params.timestamp } }
  if (m.method === 'Page.loadEventFired') loadAt = Date.now() - t0
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Network.enable'); await send('Page.enable')
await send('Network.setBlockedURLs', { urls: ['*/api/track*', '*/_vercel/insights*'] })
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(Number(waitMs))
const all = [...reqs.values()].filter((r) => r.bytes != null)
const kind = (r) => r.type === 'Image' ? 'image' : r.type === 'Fetch' || r.type === 'XHR' ? 'api' : r.type === 'Script' ? 'js' : r.type?.toLowerCase()
const sum = {}
for (const r of all) { const k = kind(r); sum[k] ??= { n: 0, kb: 0 }; sum[k].n++; sum[k].kb += r.bytes / 1024 }
console.log('load event', loadAt, 'ms; total', Math.round(all.reduce((a, r) => a + r.bytes, 0) / 1024), 'KB')
for (const [k, v] of Object.entries(sum)) console.log(' ', k.padEnd(10), String(v.n).padStart(3), 'files', String(Math.round(v.kb)).padStart(6), 'KB')
console.log('largest:')
for (const r of all.sort((a, b) => b.bytes - a.bytes).slice(0, 12)) console.log(' ', String(Math.round(r.bytes / 1024)).padStart(5), 'KB', ((r.end - r.start) * 1000).toFixed(0).padStart(6), 'ms', r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 110))
const waiting = [...reqs.values()].filter((r) => r.bytes == null)
console.log('still loading:', waiting.length)
const byKind = {}; for (const r of waiting) { const k = kind(r) ?? 'other'; byKind[k] = (byKind[k] ?? 0) + 1 }
console.log(' ', JSON.stringify(byKind))
for (const r of waiting.filter((r) => kind(r) !== 'image').slice(0, 8)) console.log('  ', r.type, (new URL(r.url).pathname + new URL(r.url).search).slice(0, 100))
for (const r of waiting.filter((r) => kind(r) === 'image').slice(0, 6)) console.log('   img', (new URL(r.url).pathname + new URL(r.url).search).slice(0, 140))
ws.close(); chrome.kill(); process.exit(0)
