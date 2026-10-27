// Renders a video composition to MP4. A composition is an HTML page that sets
// window.ready (a promise: fonts and images loaded) and window.renderFrame(t),
// which draws the frame at t seconds from t alone, so every render is identical.
// Headless Chrome draws each frame; ffmpeg encodes them. Sound effects come from
// the page's window.cues ([{ at, kind, dur }]), synthesised by ffmpeg, so there is
// no audio file to license. Music is added in Instagram when posting.
//
// Usage: node brand/social/video/_build/render.mjs <composition.html> <out.mp4> [--seconds 8] [--fps 30]
// Needs Chrome, ffmpeg (on PATH, or FFMPEG=path/to/ffmpeg.exe) and the internet for the fonts.
// Also writes <out>-feed.mp4 (1080 × 1350, centre crop for the feed) and <out>-frames.png (eight stills).
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(args[i + 1])
}
const [composition, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
const SECONDS = flag('seconds', 8)
const FPS = flag('fps', 30)
const W = 1080, H = 1920
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// Serve the repo over http so masks and images load as they would on a site (file:// blocks CSS masks).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' }
const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!path.startsWith(root) || !(await stat(path).catch(() => null))?.isFile()) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const pageUrl = `http://127.0.0.1:${server.address().port}/${relative(root, resolve(composition)).replaceAll('\\', '/')}`

const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--force-color-profile=srgb', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page') } catch {}
  if (!target) await sleep(200)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description)
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description ?? 'page error')
  return res.result?.result?.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: pageUrl })
for (let i = 0; i < 100 && !(await evaluate('typeof window.renderFrame === "function" && !!window.ready')); i++) await sleep(100)
await evaluate('window.ready')
const cues = (await evaluate('window.cues ?? []')) ?? []

// Frames go straight into ffmpeg as JPEGs; audio is built alongside from the cues.
const audio = soundtrack(cues, SECONDS)
const enc = spawn(FFMPEG, ['-v', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...audio.inputs,
  ...(audio.filter ? ['-filter_complex', audio.filter, '-map', '0:v', '-map', '[mix]', '-c:a', 'aac', '-b:a', '192k'] : []),
  // Static is pure noise and won't compress; the cap keeps a full-static video near Instagram's own bitrate.
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-maxrate', '16M', '-bufsize', '32M', '-preset', 'slow', '-movflags', '+faststart', '-t', String(SECONDS), out,
], { stdio: ['pipe', 'inherit', 'inherit'] })

const total = Math.round(SECONDS * FPS)
for (let f = 0; f < total; f++) {
  await evaluate(`window.renderFrame(${f / FPS})`)
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 95, optimizeForSpeed: true })
  if (!enc.stdin.write(Buffer.from(shot.result.data, 'base64'))) await new Promise((r) => enc.stdin.once('drain', r))
  if (f % FPS === 0) process.stdout.write(`\r${f / FPS}s / ${SECONDS}s`)
}
enc.stdin.end()
await new Promise((r, j) => enc.on('close', (code) => (code === 0 ? r() : j(new Error(`ffmpeg exited ${code}`)))))
ws.close(); chrome.kill(); server.close()

const base = out.replace(/\.mp4$/, '')
await run([FFMPEG, '-v', 'error', '-y', '-i', out, '-vf', 'crop=1080:1350:0:285', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-maxrate', '12M', '-bufsize', '24M', '-preset', 'slow', '-c:a', 'copy', '-movflags', '+faststart', `${base}-feed.mp4`])
await run([FFMPEG, '-v', 'error', '-y', '-i', out, '-vf', `fps=8/${SECONDS},scale=270:-1,tile=8x1`, '-frames:v', '1', `${base}-frames.png`])
console.log(`\r${out}, ${base}-feed.mp4, ${base}-frames.png`)

function run([cmd, ...rest]) {
  return new Promise((r, j) => spawn(cmd, rest, { stdio: 'inherit' }).on('close', (c) => (c === 0 ? r() : j(new Error(`${cmd} exited ${c}`)))))
}

// One synthesised source per cue, delayed to its time and mixed. Kinds:
// hiss (TV static), zap (a glitch: falling chirp over a noise burst), boom (the drop),
// tick (a click on the beat), off (a CRT switching off: a falling whine).
function soundtrack(cues, seconds) {
  const sources = {
    hiss: (d) => `anoisesrc=color=pink:amplitude=0.18:d=${d},highpass=f=900,lowpass=f=9000,afade=t=in:d=0.08,afade=t=out:st=${Math.max(0, d - 0.15)}:d=0.15`,
    zap: () => `aevalsrc='0.35*sin(2*PI*(2600-9000*t)*t)+0.25*(random(0)*2-1)*exp(-30*t)':d=0.14`,
    boom: () => `aevalsrc='0.9*sin(2*PI*(70-30*t)*t)*exp(-3.2*t)':d=1.4`,
    tick: () => `aevalsrc='0.4*sin(2*PI*1400*t)*exp(-70*t)':d=0.06`,
    off: () => `aevalsrc='0.3*sin(2*PI*(5200-7000*t)*t)*exp(-4*t)':d=0.6`,
  }
  const used = cues.filter((c) => sources[c.kind] && c.at < seconds)
  if (!used.length) return { inputs: [], filter: null }
  const inputs = used.flatMap((c) => ['-f', 'lavfi', '-i', sources[c.kind](c.dur ?? 1)])
  const delayed = used.map((c, i) => `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`)
  const filter = `${delayed.join(';')};${used.map((_, i) => `[a${i}]`).join('')}amix=inputs=${used.length}:normalize=0,alimiter=limit=0.8:level=disabled,apad=whole_dur=${seconds}[mix]`
  return { inputs, filter }
}
