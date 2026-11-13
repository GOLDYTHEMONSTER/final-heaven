// Editorial carousel: one post for a few products, on ink (the second template; carousel.mjs is the light one).
// 1080 x 1350 (4:5). House type: Archivo extended + JetBrains Mono, crop marks, the mark top left, numbered 01 / NN.
//   01 cover    every product's back side by side, headline
//   then per product: hero (the back, large, name and price) and details (front, print close-up, sleeve close-up)
//   last shop   every product's front, prices, sizes, delivery, link in bio
// Photos are the store photos and close-ups are crops of them: nothing is edited. Facts come from the live store.
// Usage: node brand/social/carousel/editorial.mjs [config.json]    (needs Chrome and internet)
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const STORE = 'https://www.finalheaven.shop'
const W = 1080, H = 1350, M = 72
const NAIRA = '\u20A6'
const cfgFile = resolve(process.argv[2] ?? join(here, 'editorial.json'))
const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'))
const outDir = join(here, cfg.post)
mkdirSync(outDir, { recursive: true })
const url = (f) => pathToFileURL(f).href
const money = (n) => `${NAIRA}${Number(n).toLocaleString('en-NG')}`

// "Pink 07 Hoodie — Washed Pink" -> { first: 'Pink 07', last: 'Hoodie', colour: 'Washed Pink' }
function naming(p) {
  const [title, colour] = p.name.split(/\s+[—–-]\s+/)
  const words = title.trim().split(/\s+/)
  return { first: words.slice(0, -1).join(' ') || words[0], last: words.length > 1 ? words.at(-1) : '', colour: colour || (p.colors || [])[0] || '' }
}
async function crop(file, [x, y, w, h], name) {
  const m = await sharp(file).metadata()
  const f = join(outDir, `_${name}.jpg`)
  await sharp(file).extract({ left: Math.round(x * m.width), top: Math.round(y * m.height), width: Math.round(w * m.width), height: Math.round(h * m.height) })
    .jpeg({ quality: 92 }).toFile(f)
  return f
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@400;600&display=block');
:root { --ink:#0A0A0B; --paper:#F2F1EE; --muted:#9A9AA0; }
* { box-sizing:border-box; margin:0; padding:0; }
html, body { width:${W}px; height:${H}px; overflow:hidden; background:var(--ink); color:var(--paper); }
body { position:relative; font-family:'Archivo', sans-serif; }
.display { font-weight:800; font-stretch:125%; text-transform:uppercase; letter-spacing:-0.01em; line-height:0.92; }
.outline { color:transparent; -webkit-text-stroke:2px var(--paper); }
.mono { font-family:'JetBrains Mono', monospace; text-transform:uppercase; letter-spacing:0.12em; font-size:17px; }
.muted { color:var(--muted); }
.crop { position:absolute; width:34px; height:34px; border:0 solid var(--paper); opacity:.85; }
.crop.tl { top:28px; left:28px; border-width:2px 0 0 2px; } .crop.tr { top:28px; right:28px; border-width:2px 2px 0 0; }
.crop.bl { bottom:28px; left:28px; border-width:0 0 2px 2px; } .crop.br { bottom:28px; right:28px; border-width:0 2px 2px 0; }
.top { position:absolute; top:56px; left:${M}px; right:${M}px; display:flex; justify-content:space-between; align-items:center; }
.brand { display:flex; align-items:center; gap:14px; } .brand img { height:34px; }
.brand span { font-weight:800; font-stretch:125%; font-size:19px; letter-spacing:.04em; }
.plate { position:absolute; overflow:hidden; background:#E9E6E1; }
.plate img { width:100%; height:100%; object-fit:cover; display:block; }
.tag { position:absolute; left:14px; top:14px; background:var(--ink); color:var(--paper); padding:6px 10px; font-size:14px; }
.rule { height:3px; width:96px; }
.foot { position:absolute; left:${M}px; right:${M}px; bottom:72px; display:flex; justify-content:space-between; align-items:flex-end; gap:24px; }
.button { display:inline-block; background:var(--paper); color:var(--ink); padding:22px 36px; font-weight:800; font-stretch:125%; text-transform:uppercase; font-size:24px; letter-spacing:.04em; }
`
const page = (n, total, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="top"><div class="brand"><img src="${url(join(here, '../../logo/mark-white.png'))}"><span>FINAL HEAVEN</span></div>
<div class="mono">${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div></div>
${body}
<div class="crop tl"></div><div class="crop tr"></div><div class="crop bl"></div><div class="crop br"></div></body></html>`
const plate = (x, y, w, h, img, { pos = '50% 50%', tag } = {}) =>
  `<div class="plate" style="left:${x}px; top:${y}px; width:${w}px; height:${h}px;"><img src="${url(img)}" style="object-position:${pos}">${tag ? `<div class="tag mono">${tag}</div>` : ''}</div>`
const name = (nm, size) => `<div class="display" style="font-size:${size}px;">${nm.first}${nm.last ? `<br><span class="outline">${nm.last}</span>` : ''}</div>`

// ─── Build ───────────────────────────────────────────────────────────────
const items = []
for (const c of cfg.products) {
  const p = (await (await fetch(`${STORE}/api/products/${c.id}`)).json()).product
  if (!p) throw new Error(`${c.id} isn't live on the store`)
  if (p.purchase?.state === 'sold_out') console.warn(`${p.name}: sold out on the store`)
  const src = (f) => resolve(here, f)
  const slug = naming(p).first.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  items.push({
    c, p, slug, nm: naming(p),
    front: src(c.front), back: src(c.back),
    print: await crop(src(c.back), c.crops.print, `${slug}-print`),
    sleeve: await crop(src(c.front), c.crops.sleeve, `${slug}-sleeve`),
  })
}

const slides = []
const n = items.length
// 01 cover: the backs side by side
const gw = Math.floor((W - 2 * M - 24 * (n - 1)) / n)
slides.push(['cover', (i, t) => page(i, t, `
  ${items.map((it, k) => plate(M + k * (gw + 24), 150, gw, Math.round(gw * 1.25), it.back, { pos: '50% 45%' })).join('')}
  <div style="position:absolute; left:${M}px; right:${M}px; top:${150 + Math.round(gw * 1.25) + 64}px;">
    <div class="display" style="font-size:112px;">${cfg.headline[0]}<br><span class="outline">${cfg.headline[1]}</span></div>
  </div>
  <div class="foot"><div class="mono muted">${items.map((it) => it.nm.first).join(' · ')}</div><div class="mono">Swipe</div></div>`)])
for (const it of items) {
  // hero: the back, large
  slides.push([`${it.slug}-hero`, (i, t) => page(i, t, `
    ${plate(M, 150, W - 2 * M, 860, it.back, { pos: '50% 42%' })}
    <div class="foot">${name(it.nm, 80)}
      <div style="text-align:right;"><div class="rule" style="background:${it.c.accent}; margin:0 0 18px auto;"></div>
      <div class="mono" style="line-height:1.7; white-space:nowrap;">${it.nm.colour}<br>${money(it.p.price)}</div></div></div>`)])
  // details: front tall on the left, print and sleeve close-ups on the right
  const colW = Math.floor((W - 2 * M - 24) / 2), tall = 760, half = (tall - 24) / 2
  slides.push([`${it.slug}-details`, (i, t) => page(i, t, `
    ${plate(M, 150, colW, tall, it.front, { pos: '50% 40%', tag: 'A' })}
    ${plate(M + colW + 24, 150, colW, half, it.print, { tag: 'B' })}
    ${plate(M + colW + 24, 150 + half + 24, colW, half, it.sleeve, { tag: 'C' })}
    <div style="position:absolute; left:${M}px; right:${M}px; top:${150 + tall + 56}px;">
      <div class="rule" style="background:${it.c.accent}; margin-bottom:26px;"></div>
      ${it.c.details.map((d, k) => `<div class="mono" style="margin-bottom:14px;"><span class="muted">${'ABC'[k]}&nbsp;&nbsp;</span>${d}</div>`).join('')}
    </div>
    <div class="foot"><div class="mono muted">${it.nm.first} ${it.nm.last}</div><div class="mono">Details</div></div>`)])
}
// shop: fronts side by side, prices
slides.push(['shop', (i, t) => page(i, t, `
  ${items.map((it, k) => plate(M + k * (gw + 24), 150, gw, Math.round(gw * 1.15), it.front, { pos: '50% 40%' })
    + `<div style="position:absolute; left:${M + k * (gw + 24)}px; width:${gw}px; top:${150 + Math.round(gw * 1.15) + 22}px;" class="mono">
        <div>${it.nm.first} ${it.nm.last}</div><div class="muted" style="margin-top:6px;">${it.nm.colour} · ${money(it.p.price)}</div></div>`).join('')}
  <div style="position:absolute; left:${M}px; right:${M}px; top:${150 + Math.round(gw * 1.15) + 120}px;">
    <div class="display" style="font-size:72px;">Shop<br><span class="outline">the pair</span></div>
    <div class="mono" style="margin-top:28px; line-height:1.8;"><span class="muted">Sizes&nbsp;&nbsp;</span>${[...new Set(items.flatMap((it) => it.p.sizes || []))].join(' · ')}<br><span class="muted">Delivery&nbsp;&nbsp;</span>Within Nigeria</div>
  </div>
  <div class="foot"><div class="button">Link in bio</div><div class="mono" style="text-align:right;">finalheaven.shop</div></div>`)])

const files = []
for (let k = 0; k < slides.length; k++) {
  const [nm, html] = slides[k]
  const base = `${String(k + 1).padStart(2, '0')}-${nm}`
  const htmlFile = join(outDir, `_${base}.html`), png = join(outDir, `${base}.png`)
  writeFileSync(htmlFile, html(k + 1, slides.length))
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${W},${H}`,
    '--virtual-time-budget=8000', `--screenshot=${png}`, url(htmlFile)], { stdio: 'ignore' })
  files.push(png)
}
const t = 300, th = 375, cols = Math.min(files.length, 4), rows = Math.ceil(files.length / cols)
await sharp({ create: { width: cols * (t + 16) + 16, height: rows * (th + 16) + 16, channels: 3, background: '#2a2a2c' } })
  .composite(await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(t, th).toBuffer(), left: 16 + (i % cols) * (t + 16), top: 16 + Math.floor(i / cols) * (th + 16) }))))
  .jpeg({ quality: 88 }).toFile(join(outDir, '_sheet.jpg'))
console.log(`${cfg.post}: ${files.length} slides`, items.map((it) => `${it.p.name} ${money(it.p.price)}`).join(', '))
