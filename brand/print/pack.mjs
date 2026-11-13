// Final Heaven print pack: one command turns a product folder into everything the printer needs.
// See brand/print/WORKFLOW.md.
//
//   node brand/print/pack.mjs <folder>                 build the pack from <folder>/pack.json
//   node brand/print/pack.mjs recolour <hex> <folder>  make blank-front/back.png in <folder> in a new
//                                                      wash colour, from the pink hoodie blanks (same cut)
//
// The pack:
//   1. makes the standard pieces a placement asks for ("make": "mark" | "sleeve-script")
//   2. checks every print file: fully solid or fully transparent pixels, right size, right dpi
//   3. lays every placement on the blank photos -> mockup-front.jpg, mockup-back.jpg
//   4. writes previews of each file on black and on the garment colour (white art is invisible on a phone)
//   5. writes spec.html and renders final-heaven-<slug>-spec.pdf for the printer and embroiderer
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const LOGO = join(root, '../logo/mark-white.png')
const SCRIPT_SRC = join(root, 'png/varsity-07-hoodie-back.png') // "Final" and "Heaven" script lettering
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const cmPx = (cm, dpi) => Math.round((cm / 2.54) * dpi)

// ---------- art helpers ----------
// Resize, then force every pixel to fully solid (one flat colour) or fully transparent.
export async function solidify(input, width, colourOf) {
  const { data, info } = await sharp(input).ensureAlpha().resize({ width, kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < info.width * info.height; i++) {
    const p = i * 4
    if (data[p + 3] < 128) { data.fill(0, p, p + 4); continue }
    const c = colourOf(data[p], data[p + 1], data[p + 2]); data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255
  }
  return { data, info }
}
export const toPng = ({ data, info }, dpi) =>
  sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().withMetadata({ density: dpi }).toBuffer()

// Art for the embroiderer is at 600 dpi, for the DTF printer at 300 dpi.
const dpiFor = (p) => (p.method === 'embroidery' ? 600 : 300)

async function makeMark(p, dir) {
  const rgb = hex(p.colour), dpi = dpiFor(p)
  const h = cmPx(p.heightCm, dpi)
  await sharp(await toPng(await solidify(LOGO, Math.round(h * 883 / 1000), () => rgb), dpi)).toFile(join(dir, p.file))
}

// "Final Heaven" on one line in the varsity script, slim finish (owner, 10 Nov 2026)
export async function makeSleeveScript(p, dir) {
  const word = async (top, bottom) => sharp(await sharp(SCRIPT_SRC).extract({ left: 0, top, width: 2480, height: bottom - top }).png().toBuffer())
    .trim({ threshold: 1 }).png().toBuffer()
  const final = await word(131, 995), heaven = await word(2331, 3243)
  const fm = await sharp(final).metadata(), hm = await sharp(heaven).metadata()
  const HEAVEN_BASE = 0.82, SPACE = 110 // Final sits on Heaven's letter baseline, above the swash
  const drop = Math.max(0, Math.round(fm.height - hm.height * HEAVEN_BASE))
  const w = fm.width + SPACE + hm.width, h = Math.max(fm.height, hm.height + drop)
  const line = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: final, left: 0, top: 0 }, { input: heaven, left: fm.width + SPACE, top: drop }]).png().toBuffer()
  const { data: a, info } = await sharp(line).extractChannel(3).blur(6).raw().toBuffer({ resolveWithObject: true })
  const slim = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0; i < info.width * info.height; i++) { slim.fill(255, i * 4, i * 4 + 3); slim[i * 4 + 3] = a[i] > 195 ? 255 : 0 }
  const rgb = hex(p.colour)
  const src = await sharp(slim, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  await sharp(await toPng(await solidify(src, cmPx(p.widthCm, dpiFor(p)), () => rgb), dpiFor(p))).toFile(join(dir, p.file))
}

// ---------- recolour blanks ----------
async function recolour(target, dir) {
  const T = hex(target)
  mkdirSync(dir, { recursive: true })
  for (const side of ['front', 'back']) {
    const { data, info } = await sharp(join(root, 'hoodie-07-pink', `blank-${side}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let sum = 0, n = 0
    for (let i = 0; i < data.length; i += 3) if (data[i] - data[i + 1] > 40) { sum += data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11; n++ }
    const Lm = sum / n
    for (let i = 0; i < data.length; i += 3) {
      const sat = Math.max(0, Math.min(1, (data[i] - data[i + 1] - 8) / 30)) // how pink: fabric vs background
      if (!sat) continue
      const L = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / Lm
      for (let k = 0; k < 3; k++) data[i + k] = data[i + k] * (1 - sat) + Math.min(255, T[k] * Math.pow(L, 1.15)) * sat
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(join(dir, `blank-${side}.png`))
  }
  console.log('wrote blank-front.png and blank-back.png in', dir)
}

// ---------- checks ----------
async function check(p, dir) {
  const f = join(dir, p.file)
  if (!existsSync(f)) throw new Error(`${p.name}: missing ${p.file}`)
  const meta = await sharp(f).metadata()
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let semi = 0; const colours = new Set()
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * 4 + 3]
    if (a && a < 255) semi++
    if (a) colours.add('#' + [0, 1, 2].map((k) => data[i * 4 + k].toString(16).padStart(2, '0')).join('').toUpperCase())
  }
  if (semi) throw new Error(`${p.name}: ${semi} semi-transparent pixels in ${p.file}; DTF prints them as haze`)
  const dpi = meta.density
  const wCm = (info.width / dpi) * 2.54, hCm = (info.height / dpi) * 2.54
  if (Math.abs(wCm - p.widthCm) > 0.15) throw new Error(`${p.name}: ${p.file} is ${wCm.toFixed(2)} cm wide, pack.json says ${p.widthCm}`)
  if (colours.size > 12) console.warn(`  ! ${p.name}: ${colours.size} colours; is it really flat art?`)
  return { w: info.width, h: info.height, dpi, wCm, hCm, colours: [...colours] }
}

// ---------- mock-ups ----------
export async function lay(photo, file, { cx, top, widthCm, rotate = 0, stitch = false }, ppcm) {
  const { data, info } = photo
  let a = sharp(file).resize({ width: Math.round(widthCm * ppcm), kernel: 'lanczos3' })
  if (rotate) a = sharp(await a.png().toBuffer()).rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
  const { data: ad, info: ai } = await a.raw().toBuffer({ resolveWithObject: true })
  const x0 = Math.round(cx - ai.width / 2), y0 = Math.round(top)
  let sum = 0, n = 0
  for (let y = 0; y < ai.height; y++) for (let x = 0; x < ai.width; x++) {
    const p = ((y0 + y) * info.width + x0 + x) * 3; sum += data[p] + data[p + 1] + data[p + 2]; n++
  }
  const mean = sum / n
  const alpha = (x, y) => (x < 0 || y < 0 || x >= ai.width || y >= ai.height ? 0 : ad[(y * ai.width + x) * 4 + 3] / 255)
  for (let y = -6; y < ai.height + 6; y++) for (let x = -6; x < ai.width + 6; x++) {
    const p = ((y0 + y) * info.width + x0 + x) * 3
    const al = alpha(x, y)
    if (stitch && al < 1) {
      const sh = alpha(x - 2, y - 3) * (1 - al) * 0.35
      if (sh > 0) for (let k = 0; k < 3; k++) data[p + k] *= 1 - sh
    }
    if (al <= 0) continue
    const q = (y * ai.width + x) * 4
    const L = (data[p] + data[p + 1] + data[p + 2]) / mean
    let shade = Math.min(1.06, Math.max(0.78, 0.55 + 0.45 * L))
    if (stitch) {
      shade *= 0.93 + 0.07 * Math.sin((x * 0.8 + y * 1.6) * 1.1)
      if (alpha(x - 2, y - 2) < 0.5) shade *= 1.06
      if (alpha(x + 2, y + 2) < 0.5) shade *= 0.82
    }
    for (let k = 0; k < 3; k++) {
      const ink = Math.min(255, ad[q + k] * shade * 0.93 + data[p + k] * 0.07) // a little fabric shows through
      data[p + k] = data[p + k] * (1 - al) + ink * al
    }
  }
}

async function mockups(cfg, dir) {
  const S = 2, ppcm = cfg.photos.pxPerCm * S
  for (const side of ['front', 'back']) {
    const list = cfg.placements.filter((p) => p.side === side)
    if (!list.length) continue
    const photo = await sharp(join(dir, cfg.photos[side])).resize({ width: cfg.photos.width * S, kernel: 'lanczos3' })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true })
    for (const p of list) {
      const file = join(dir, p.file)
      const stitch = p.method === 'embroidery'
      if (p.cuffs) {
        const m = await sharp(file).metadata(), hCm = p.widthCm * m.height / m.width
        for (const [cx, rib, rot] of p.cuffs)
          await lay(photo, file, { cx: cx * S, top: rib * S - (p.aboveCm + hCm) * ppcm, widthCm: p.widthCm, rotate: rot, stitch }, ppcm)
      } else {
        await lay(photo, file, { cx: p.cx * S, top: p.fromY * S + p.belowCm * ppcm, widthCm: p.widthCm, stitch }, ppcm)
      }
    }
    await sharp(photo.data, { raw: { width: photo.info.width, height: photo.info.height, channels: 3 } }).jpeg({ quality: 90 }).toFile(join(dir, `mockup-${side}.jpg`))
  }
}

async function previews(cfg, dir) {
  mkdirSync(join(dir, 'previews'), { recursive: true })
  for (const p of cfg.placements) for (const [tag, bg] of [['on-black', '#000000'], ['on-garment', cfg.garmentHex]]) {
    const m = await sharp(join(dir, p.file)).metadata(), pad = Math.round(m.width * 0.08)
    await sharp(join(dir, p.file)).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .flatten({ background: bg }).resize({ width: Math.min(2000, m.width + pad * 2) }).jpeg({ quality: 90 })
      .toFile(join(dir, 'previews', p.file.replace(/\.png$/, `-${tag}.jpg`)))
  }
}

// ---------- spec sheet ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const fmt = (n) => n.toFixed(1)
function specHtml(cfg, facts) {
  const P = cfg.placements, dtf = P.filter((p) => p.method === 'dtf'), emb = P.filter((p) => p.method === 'embroidery')
  const label = (p) => (p.method === 'dtf' ? 'DTF' : 'Embroidery')
  const size = (p) => `<b>${fmt(facts[p.name].wCm)} × ${fmt(facts[p.name].hCm)} cm</b>`
  const caption = (side) => P.filter((p) => p.side === side).map((p) => `${p.name} ${label(p)}`).join(' · ')
  const steps = [...(emb.length ? [`Embroider the ${emb.map((p) => p.name.toLowerCase()).join(' and ')}.`] : []), ...dtf.map((p) => `Press the ${p.name.toLowerCase()} DTF.`)]
  const inks = [...new Set(dtf.flatMap((p) => facts[p.name].colours))]
  const named = (h) => (cfg.colours || []).find((c) => c.hex.toUpperCase() === h) || { name: h, use: '' }
  const row = (th, td) => `<tr><th>${th}</th><td>${td}</td></tr>`
  const sw = (h) => `<span class="swatch" style="background:${h}"></span>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Final Heaven: ${esc(cfg.title)} spec</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..900&display=block" rel="stylesheet">
<style>
@page{size:A4;margin:0}*{box-sizing:border-box;margin:0;padding:0}html,body{background:#fff}
body{font-family:'Archivo',sans-serif;color:#111;font-size:9.6pt;line-height:1.38;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;padding:13mm 14mm 12mm;position:relative;overflow:hidden;page-break-after:always}.page:last-child{page-break-after:auto}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:3mm;margin-bottom:5mm}
h1{font-weight:850;font-stretch:125%;text-transform:uppercase;font-size:19pt;line-height:1}
.meta{text-align:right;font-size:8pt;color:#555}
h2{font-weight:800;font-stretch:115%;text-transform:uppercase;font-size:10.5pt;letter-spacing:.04em;margin:5mm 0 2mm;display:flex;gap:2.5mm;align-items:center}
.tag{font-size:7pt;font-weight:700;letter-spacing:.1em;padding:.6mm 1.8mm;border-radius:1mm;color:#fff;background:#111;text-transform:uppercase}.tag.emb{background:#8a5a2b}
.shots{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.shots figure{background:#ECEAE6;border-radius:2mm;overflow:hidden;display:flex;flex-direction:column}
.shots img{width:100%;display:block}.shots figcaption{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:2mm 3mm;background:#fff;flex:1}
table{width:100%;border-collapse:collapse;font-size:9pt}td,th{text-align:left;vertical-align:top;padding:1.6mm 2mm;border-bottom:.3mm solid #ddd}
th{width:34mm;font-weight:700;color:#444}code{font-family:Consolas,monospace;font-size:8pt;background:#f2f1ee;padding:.2mm 1mm;border-radius:.8mm}
.art{display:grid;grid-template-columns:repeat(${P.length},1fr);gap:4mm;margin-top:2mm}.art figure{border:.3mm solid #ddd;border-radius:2mm;padding:3mm;text-align:center}
.art .bg{height:46mm;display:flex;align-items:center;justify-content:center;border-radius:1.5mm;background:${cfg.garmentHex}}
.art img{max-height:40mm;max-width:90%}.art figcaption{font-size:7.6pt;margin-top:2mm;color:#333}
.warn{border-left:1.2mm solid #111;background:#F2F1EE;padding:2.5mm 3.5mm;margin-top:4mm;font-size:9pt}
.swatch{display:inline-block;width:3mm;height:3mm;border:.2mm solid #999;vertical-align:-.3mm;margin-right:1mm}
.note{font-size:8pt;color:#555;margin-top:2mm}
footer{position:absolute;left:14mm;right:14mm;bottom:8mm;font-size:7.5pt;color:#777;display:flex;justify-content:space-between}
</style></head><body>
<section class="page">
<header><div><h1>${esc(cfg.title)}</h1><div style="font-size:9pt;margin-top:1.5mm">${emb.length ? 'Print and embroidery spec' : 'Print spec'} for the ${emb.length ? 'printer and embroiderer' : 'printer'}</div></div>
<div class="meta">Final Heaven · finalheaven.shop<br>Version ${cfg.version} · ${esc(cfg.date)}</div></header>
<div class="shots">${['front', 'back'].filter((s) => existsSync(join(cfg.dir, `mockup-${s}.jpg`))).map((s) => `<figure><img src="mockup-${s}.jpg" alt="${s}"><figcaption>${s}: ${esc(caption(s))}</figcaption></figure>`).join('')}</div>
<h2>Garment</h2><table>
${row('Blank', esc(cfg.garment))}
${row('Decorations', `<b>${P.length} placements:</b> ${P.map((p) => `${p.name.toLowerCase()} ${p.method === 'dtf' ? 'DTF' : 'embroidery'}`).join(', ')}.`)}
${row('Order of work', steps.map((s, i) => `${i + 1}. ${s}`).join(' &nbsp;'))}
${row('Before the order', '<b>Make one sample first.</b> Wash it once at 30&nbsp;°C inside out, then send a photo before the full run.')}
</table>
<h2>Placements</h2><table>${P.map((p) => row(`${esc(p.name)} · ${label(p)}`, `${p.what ? esc(p.what) + ', ' : ''}${size(p)}. ${p.where}`)).join('')}</table>
<p class="note">${cfg.sizeNote || 'Sizes are for a size L. Use the same transfer size on every garment size.'}</p>
<footer><span>Final Heaven · ${esc(cfg.title)} · spec v${cfg.version}</span><span>1 / 2</span></footer></section>
<section class="page">
<header><div><h1>Files and settings</h1></div><div class="meta">${esc(cfg.title)} · v${cfg.version}</div></header>
<div class="art">${P.map((p) => `<figure><div class="bg"><img src="${p.file}" alt="" style="${facts[p.name].wCm / facts[p.name].hCm > 2 ? 'max-height:14mm' : ''}"></div><figcaption><span class="tag${p.method === 'dtf' ? '' : ' emb'}">${label(p)}</span> ${esc(p.name)}${p.cuffs ? ` ×${p.cuffs.length}` : ''}</figcaption></figure>`).join('')}</div>
${dtf.length ? `<h2><span class="tag">DTF</span> For the DTF printer</h2><table>
${row('Files', dtf.map((p) => `<code>${p.file}</code> (${facts[p.name].w} × ${facts[p.name].h} px)`).join('<br>') + '<br>Transparent PNG, RGB, 300 dpi, <b>already at print size</b>. Print at 100%: do not scale it.')}
${row('Colours', inks.map((h) => { const c = named(h); return `${sw(h)}<b>${esc(c.name)}</b> ${h}${c.use ? ` (${esc(c.use)})` : ''}` }).join(' &nbsp; '))}
${row('Transparency', 'Every pixel is either fully solid or fully transparent, with no soft edges and no see-through ink. Do not add a background or a box.')}
${row('White underbase', 'Full underbase under every colour. Choke it by <b>2–3 px</b> so no white edge shows.')}
${row('Press', 'Pre-press the area for <b>5 s</b> to remove moisture and flatten the wash texture.<br>Press at <b>160–165 °C, 12–15 s, medium-firm pressure</b>.<br>Peel hot or cold, whichever your film is made for.<br>Press again for <b>5–10 s</b> under parchment or a Teflon sheet.<br>Your film\'s own settings take priority if they differ.')}
${row('Garment care', `Use a platen pad or insert so seams and pockets don't leave ridges.${emb.length ? ' Keep the embroidered areas <b>off the platen</b>: don\'t press over the embroidery.' : ''}`)}
</table>` : ''}
${emb.map((p) => `<h2><span class="tag emb">Embroidery</span> For the embroiderer</h2><table>
${row('File', `<code>${p.file}</code>, the artwork at final size (${fmt(facts[p.name].wCm)} × ${fmt(facts[p.name].hCm)} cm, ${facts[p.name].dpi} dpi). Please digitise it from this file and send the stitch-out before the run.`)}
${row('Thread', esc(p.thread))}
${row('Stitches', p.stitches ? p.stitches : 'Satin for the letters and for the swash. The lettering is deliberately slim: keep that look, but widen any stroke that comes out under <b>1 mm</b> to 1 mm so it stitches cleanly. You may open up small counters slightly so they don\'t fill in.')}
${row('Backing', 'Medium cut-away stabiliser, plus a water-soluble topping so the stitches sit on top of the fleece.')}
${row('Hooping', p.cuffs ? 'Hoop the sleeve on a sleeve or cylinder arm, or open the sleeve seam and close it again. Don\'t stretch the knit while hooping. Both sleeves read the same way: do <b>not</b> mirror it.' : 'Don\'t stretch the knit while hooping.')}
</table>`).join('')}
<div class="warn"><b>Before printing:</b> check the sample on the real blank. Colours should be clean and solid, with no white halo around the edges. Small text and the embroidery should read clearly from about 1 m away. Send a photo before the full run.</div>
<footer><span>Questions: hello@finalheaven.shop</span><span>2 / 2</span></footer></section></body></html>`
}

function render(dir, slug) {
  const url = pathToFileURL(join(dir, 'spec.html')).href
  const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer', '--virtual-time-budget=15000']
  execFileSync(CHROME, [...base, `--print-to-pdf=${join(dir, `final-heaven-${slug}-spec.pdf`)}`, url], { stdio: 'ignore' })
  execFileSync(CHROME, [...base, '--force-device-scale-factor=1.5', '--window-size=794,2246', `--screenshot=${join(dir, 'spec-preview.png')}`, url], { stdio: 'ignore' })
}

// ---------- main ----------
const direct = import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href
const [cmd, ...rest] = direct ? process.argv.slice(2) : [null]
if (!direct) {
  // imported by a design's art.mjs for solidify/toPng
} else if (cmd === 'recolour') {
  await recolour(rest[0], resolve(rest[1]))
} else if (cmd) {
  const dir = resolve(cmd)
  const cfg = { ...JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')), dir }
  for (const p of cfg.placements) {
    if (p.make === 'mark') await makeMark(p, dir)
    if (p.make === 'sleeve-script') await makeSleeveScript(p, dir)
  }
  const facts = {}
  for (const p of cfg.placements) {
    facts[p.name] = await check(p, dir)
    const f = facts[p.name]
    console.log(`ok  ${p.name.padEnd(8)} ${p.file}  ${fmt(f.wCm)} × ${fmt(f.hCm)} cm @ ${f.dpi} dpi  ${f.colours.join(' ')}`)
  }
  await mockups(cfg, dir)
  await previews(cfg, dir)
  writeFileSync(join(dir, 'spec.html'), specHtml(cfg, facts))
  render(dir, cfg.slug)
  console.log(`wrote mockup-front.jpg, mockup-back.jpg, previews/, spec.html, final-heaven-${cfg.slug}-spec.pdf`)
} else {
  console.log('usage: node brand/print/pack.mjs <folder> | recolour <#hex> <folder>')
}
