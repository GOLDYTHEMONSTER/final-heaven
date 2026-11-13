// Product carousel for Instagram: 1080 x 1350 (4:5) slides in the house style (Archivo extended + JetBrains Mono,
// studio paper, crop marks, the mark top left).
//   01 cover  front and back together     02 back  the print, as large as it goes
//   03 front  the front on its own         04 shop  details, price and where to buy
// A product with only a back shot gets 01 (back) and 04.
//
// Placement is fixed, not per photo: each garment is cut out of its mockup (the backdrop is measured and trimmed,
// a front-and-back spread is split at the gap between the two), then fitted into the same box on every slide, so
// every product in the feed sits at the same size and height whatever padding the mockup came with.
// Name, colour, price and sizes are read from the live store, so the slides always match it.
//
// Usage: node brand/social/carousel/carousel.mjs [slug]     (needs Chrome and internet, for the store and the fonts)
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const STORE = 'https://www.finalheaven.shop'
const W = 1080, H = 1350, M = 72 // canvas and side margin
// The product boxes: every slide of every product uses these, so placement never drifts.
const BOX = {
  cover: { top: 168, height: 820, width: W - 2 * M },  // the spread
  single: { top: 150, height: 960, width: 860 },       // one garment, front or back
  shop: { top: 168, height: 500, width: 760 },         // the spread, smaller, above the details
}
const NAIRA = '\u20A6'

// ─── Cut-out ─────────────────────────────────────────────────────────────
// The backdrop colour (corners), the garments' bounding box, and for a spread the split between front and back.
async function cut(file, outDir, name, { split }) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const px = (x, y) => (y * w + x) * 3
  const corners = [[4, 4], [w - 12, 4], [4, h - 12], [w - 12, h - 12]]
  const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, [x, y]) => s + data[px(x, y) + k], 0) / 4))
  const ink = (x, y) => { const p = px(x, y); return Math.abs(data[p] - bg[0]) + Math.abs(data[p + 1] - bg[1]) + Math.abs(data[p + 2] - bg[2]) > 36 }
  const cols = new Array(w).fill(0), rows = new Array(h).fill(0)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) { cols[x]++; rows[y]++ }
  const first = (a, min) => a.findIndex((v) => v > min), last = (a, min) => a.length - 1 - [...a].reverse().findIndex((v) => v > min)
  const box = { left: first(cols, 2), right: last(cols, 2), top: first(rows, 2), bottom: last(rows, 2) }
  const parts = { all: { box } }
  if (split) {
    // Front and back can overlap side by side (sleeve tips), so no straight or row-by-row cut is safe. Both garments
    // grow at once from their middles, through the garment pixels only: a sleeve stays with the body it is joined
    // to, and the two meet only where they actually touch. Done on a half-size grid.
    const S = 2, mw = Math.ceil(w / S), mh = Math.ceil(h / S), owner = new Uint8Array(mw * mh)
    const m = (x, y) => ink(Math.min(w - 1, x * S), Math.min(h - 1, y * S))
    const span = box.right - box.left
    let queue = []
    for (const [id, frac] of [[1, 0.25], [2, 0.75]]) {
      const x = Math.round((box.left + span * frac) / S)
      for (let y = Math.floor(box.top / S); y <= box.bottom / S; y++) if (m(x, y) && !owner[y * mw + x]) { owner[y * mw + x] = id; queue.push(y * mw + x) }
    }
    while (queue.length) {
      const next = []
      for (const i of queue) {
        const cx = i % mw, cy = (i - cx) / mw
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy, j = ny * mw + nx
          if (nx >= 0 && ny >= 0 && nx < mw && ny < mh && !owner[j] && m(nx, ny)) { owner[j] = owner[i]; next.push(j) }
        }
      }
      queue = next
    }
    if (process.env.CAROUSEL_DEBUG) { // which garment each pixel went to: red front, blue back
      const dbg = Buffer.alloc(mw * mh * 3)
      for (let i = 0; i < mw * mh; i++) { dbg[i * 3] = owner[i] === 1 ? 230 : 40; dbg[i * 3 + 2] = owner[i] === 2 ? 230 : 40; dbg[i * 3 + 1] = owner[i] ? 40 : 220 }
      await sharp(dbg, { raw: { width: mw, height: mh, channels: 3 } }).png().toFile(join(outDir, `_${name}-owners.png`))
    }
    const ownerAt = (x, y) => owner[Math.floor(y / S) * mw + Math.floor(x / S)]
    const boxOf = (id) => {
      const r = { left: w, right: 0, top: h, bottom: 0 }
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (owner[y * mw + x] === id) {
        r.left = Math.min(r.left, x * S); r.right = Math.max(r.right, Math.min(w - 1, x * S + S - 1))
        r.top = Math.min(r.top, y * S); r.bottom = Math.max(r.bottom, Math.min(h - 1, y * S + S - 1))
      }
      return r
    }
    // keep a pixel unless it belongs to the other garment (backdrop and soft edges stay)
    parts.front = { box: boxOf(1), keep: (x, y) => ownerAt(x, y) !== 2 }
    parts.back = { box: boxOf(2), keep: (x, y) => ownerAt(x, y) !== 1 }
    // Touching garments overlap: each hides the tip of the other's sleeve, and the photo doesn't have those pixels.
    // Nothing is rebuilt or cut out (it shows). Instead the single slide is a closer framing of the original photo,
    // centred on the garment and full-bleed, so the neighbour's sleeve tip runs off the slide edge as in any photo crop.
    for (const [k, side] of [['front', 1], ['back', -1]]) { // side: which way the other garment is
      const p = parts[k], b = p.box
      const y = Math.round(b.top + (b.bottom - b.top) * 0.93) // near the hem: body only, no sleeves
      let l = b.right, r = b.left
      for (let x = b.left; x <= b.right; x++) if (ink(x, y) && p.keep(x, y)) { l = Math.min(l, x); r = Math.max(r, x) }
      const cx = (l + r) / 2
      const shortBy = side === 1 ? (cx - b.left) - (b.right - cx) : (b.right - cx) - (cx - b.left)
      if (shortBy < (b.right - b.left) * 0.015) continue // just touching (cuffs): the garment is whole
      // a 4:5 window: the garment fills 70% of its height, sitting a little above centre (room for the footer)
      const gh = b.bottom - b.top, wh = Math.round(gh / 0.7), ww = Math.round(wh * 0.8)
      const gx = (b.left + b.right) / 2, top = Math.round(b.top - wh * 0.13)
      p.full = { left: Math.round(gx - ww / 2), top, width: ww, height: wh }
    }
  }
  const out = {}
  for (const [k, part] of Object.entries(parts)) {
    const b = part.box, cw = b.right - b.left + 1, ch = b.bottom - b.top + 1
    const crop = Buffer.alloc(cw * ch * 3)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const sx = b.left + x, sy = b.top + y, p = px(sx, sy), q = (y * cw + x) * 3
      const foreign = part.keep && !part.keep(sx, sy)
      for (let c = 0; c < 3; c++) crop[q + c] = foreign ? bg[c] : data[p + c]
    }
    const f = join(outDir, `_${name}-${k}.png`)
    await sharp(crop, { raw: { width: cw, height: ch, channels: 3 } }).png().toFile(f)
    out[k] = f
    if (part.full) { // the framing, straight from the photo; beyond the photo's edge, the backdrop continues
      const { left, top, width, height } = part.full
      const il = Math.max(0, left), it = Math.max(0, top), ir = Math.min(w, left + width), ib = Math.min(h, top + height)
      const ff = join(outDir, `_${name}-${k}-full.png`)
      await sharp(file).removeAlpha().extract({ left: il, top: it, width: ir - il, height: ib - it })
        .extend({ left: il - left, top: it - top, right: left + width - ir, bottom: top + height - ib, background: { r: bg[0], g: bg[1], b: bg[2] } })
        .png().toFile(ff)
      out[`${k}Full`] = ff
    }
  }
  return { bg: `rgb(${bg.join(',')})`, ...out }
}

// ─── Slides ──────────────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@400;600&display=block');
:root { --ink:#0A0A0B; --muted:#6B6B70; }
* { box-sizing:border-box; margin:0; padding:0; }
html, body { width:${W}px; height:${H}px; overflow:hidden; }
body { position:relative; font-family:'Archivo', sans-serif; color:var(--ink); }
.display { font-weight:800; font-stretch:125%; text-transform:uppercase; letter-spacing:-0.01em; line-height:0.92; }
.outline { color:transparent; -webkit-text-stroke:2px var(--ink); }
.mono { font-family:'JetBrains Mono', monospace; text-transform:uppercase; letter-spacing:0.12em; font-size:17px; }
.muted { color:var(--muted); }
.crop { position:absolute; width:34px; height:34px; border:0 solid var(--ink); opacity:.85; }
.crop.tl { top:28px; left:28px; border-width:2px 0 0 2px; } .crop.tr { top:28px; right:28px; border-width:2px 2px 0 0; }
.crop.bl { bottom:28px; left:28px; border-width:0 0 2px 2px; } .crop.br { bottom:28px; right:28px; border-width:0 2px 2px 0; }
.top { position:absolute; top:56px; left:${M}px; right:${M}px; display:flex; justify-content:space-between; align-items:center; }
.brand { display:flex; align-items:center; gap:14px; } .brand img { height:34px; }
.brand span { font-weight:800; font-stretch:125%; font-size:19px; letter-spacing:.04em; }
.box { position:absolute; left:50%; transform:translateX(-50%); display:flex; align-items:center; justify-content:center; }
.full { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
.top, .foot, .crop { z-index:1; }
.box img { width:100%; height:100%; object-fit:contain; display:block; } /* fills the box: same size on every slide, whatever the photo size */
.foot { position:absolute; left:${M}px; right:${M}px; bottom:72px; display:flex; justify-content:space-between; align-items:flex-end; gap:24px; }
.specs { display:grid; grid-template-columns:170px 1fr; row-gap:14px; column-gap:16px; padding-top:22px; border-top:1px solid rgba(10,10,11,.2); }
.button { display:inline-block; background:var(--ink); color:#F2F1EE; padding:22px 36px; font-weight:800; font-stretch:125%; text-transform:uppercase; font-size:24px; letter-spacing:.04em; }
`
const rel = (from, to) => pathToFileURL(to).href
const page = (bg, n, total, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body style="background:${bg}">
<div class="top"><div class="brand"><img src="${rel(0, join(here, '../../logo/mark-black.png'))}"><span>FINAL HEAVEN</span></div>
<div class="mono">${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div></div>
${body}
<div class="crop tl"></div><div class="crop tr"></div><div class="crop bl"></div><div class="crop br"></div></body></html>`
const full = (img) => `<img class="full" src="${rel(0, img)}">`
const boxed = (b, img) => `<div class="box" style="top:${b.top}px; width:${b.width}px; height:${b.height}px;"><img src="${rel(0, img)}"></div>`

// "Main Character Tee — Acid Black" -> title lines and colour
function naming(p) {
  const [title, colour] = p.name.split(/\s+[—–-]\s+/)
  const words = title.trim().split(/\s+/)
  return { first: words.slice(0, -1).join(' ') || words[0], last: words.length > 1 ? words.at(-1) : '', colour: colour || (p.colors || [])[0] || '' }
}
const money = (n) => `${NAIRA}${Number(n).toLocaleString('en-NG')}`
const nameBlock = (nm, size) => `<div class="display" style="font-size:${size}px;">${nm.first}${nm.last ? `<br><span class="outline">${nm.last}</span>` : ''}</div>`

function slides(p, cut, hasSpread) {
  const nm = naming(p), price = money(p.price), sizes = (p.sizes || []).join(' · ')
  const list = []
  const total = hasSpread ? 4 : 2
  if (hasSpread) {
    list.push(['01-cover', (n) => page(cut.bg, n, total, `${boxed(BOX.cover, cut.all)}
      <div class="foot">${nameBlock(nm, 76)}<div class="mono" style="text-align:right; line-height:1.7; white-space:nowrap;">${nm.colour}<br>${price}</div></div>`)])
    list.push(['02-back', (n) => page(cut.backBg ?? cut.bg, n, total, `${cut.backDetail ? boxed(BOX.single, cut.backDetail) : cut.backFull ? full(cut.backFull) : boxed(BOX.single, cut.back)}
      <div class="foot"><div class="mono">Back</div><div class="mono muted">Swipe for the front</div></div>`)])
    list.push(['03-front', (n) => page(cut.bg, n, total, `${cut.frontFull ? full(cut.frontFull) : boxed(BOX.single, cut.front)}
      <div class="foot"><div class="mono">Front</div><div class="mono muted">The mark</div></div>`)])
  } else {
    list.push(['01-cover', (n) => page(cut.bg, n, total, `${boxed({ ...BOX.single, height: 860 }, cut.all)}
      <div class="foot">${nameBlock(nm, 76)}<div class="mono" style="text-align:right; line-height:1.7; white-space:nowrap;">${nm.colour}<br>${price}</div></div>`)])
  }
  list.push(['04-shop', (n) => page(cut.bg, n, total, `${boxed(BOX.shop, cut.all)}
    <div style="position:absolute; left:${M}px; right:${M}px; top:720px;">
      ${nameBlock(nm, 64)}
      <div class="specs mono" style="margin-top:30px;">
        <span class="muted">Colour</span><span>${nm.colour}</span>
        ${sizes ? `<span class="muted">Sizes</span><span>${sizes}</span>` : ''}
        <span class="muted">Price</span><span>${price}</span>
        <span class="muted">Delivery</span><span>Within Nigeria</span>
      </div>
    </div>
    <div class="foot"><div class="button">Shop now</div><div class="mono" style="text-align:right; line-height:1.7;">Link in bio<br>finalheaven.shop</div></div>`)])
  return list.map(([name, html], i) => [name.replace(/^\d+/, String(i + 1).padStart(2, '0')), html(i + 1)])
}

// ─── Build ───────────────────────────────────────────────────────────────
const cfg = JSON.parse(readFileSync(join(here, 'carousel.json'), 'utf8'))
const only = process.argv[2]
for (const item of cfg.products) {
  if (only && item.slug !== only) continue
  const res = await fetch(`${STORE}/api/products/${item.id}`)
  const p = (await res.json()).product
  if (!p) throw new Error(`${item.slug}: ${item.id} isn't live on the store`)
  if (p.purchase?.state === 'sold_out') console.warn(`${item.slug}: sold out on the store`)
  const dir = join(here, item.slug)
  mkdirSync(dir, { recursive: true })
  const src = (f) => join(here, f)
  let c
  if (item.spread) {
    c = await cut(src(item.spread), dir, 'spread', { split: true })
    if (item.back) { const b = await cut(src(item.back), dir, 'back', { split: false }); c.backDetail = b.all; c.backBg = b.bg }
  } else {
    c = await cut(src(item.back), dir, 'back', { split: false })
  }
  const files = []
  for (const [name, html] of slides(p, c, !!item.spread)) {
    const htmlFile = join(dir, `_${name}.html`), png = join(dir, `${name}.png`)
    writeFileSync(htmlFile, html)
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${W},${H}`,
      '--virtual-time-budget=8000', `--screenshot=${png}`, pathToFileURL(htmlFile).href], { stdio: 'ignore' })
    files.push(png)
  }
  // a contact sheet of the carousel, for review
  const t = 360, th = 450
  await sharp({ create: { width: t * files.length + 20 * (files.length + 1), height: th + 40, channels: 3, background: '#d9d7d2' } })
    .composite(await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(t, th).toBuffer(), left: 20 + i * (t + 20), top: 20 }))))
    .jpeg({ quality: 88 }).toFile(join(dir, '_sheet.jpg'))
  console.log(`${item.slug}: ${p.name}, ${money(p.price)} -> ${files.length} slides`)
}
