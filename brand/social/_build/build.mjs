// Builds the Instagram packs as HTML, then renders each one to PNG with headless Chrome.
// Same system as Drop 01: crop marks, page numbers, spec rows, Archivo extended + JetBrains Mono.
// Usage: node brand/social/_build/build.mjs   (needs Chrome and an internet connection for the fonts)
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const social = join(here, '..')
const htmlDir = join(here, 'html')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// Paths as seen from html/.
const shot = (f) => `../../shoot-02/${f}.jpg`
const product = (dir, f) => `../../../../public/products/${dir}/${f}.jpg`
const logo = (f) => `../../../logo/${f}.png`

const css = (w, h) => `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@400;600&display=block');
:root { --ink:#0A0A0B; --paper:#F2F1EE; --studio:#ECEAE6; --ember:#E8613C; --rose:#D23A4E; --muted:#A3A3A8; --muted-dark:#6B6B70; }
* { box-sizing:border-box; margin:0; padding:0; }
html, body { width:${w}px; height:${h}px; overflow:hidden; background:var(--ink); color:var(--paper); }
body { position:relative; font-family:'Archivo', sans-serif; }
body.paper { background:var(--paper); color:var(--ink); }
.display { font-weight:800; font-stretch:125%; text-transform:uppercase; letter-spacing:-0.01em; line-height:0.92; }
.outline { color:transparent; -webkit-text-stroke:2px var(--paper); }
.paper .outline { -webkit-text-stroke-color:var(--ink); }
.mono { font-family:'JetBrains Mono', monospace; text-transform:uppercase; letter-spacing:0.12em; font-size:17px; }
.muted { color:var(--muted); }
.paper .muted { color:var(--muted-dark); }
.accent { color:var(--accent); }
.was { text-decoration:line-through; text-decoration-thickness:2px; color:var(--muted); }
.paper .was { color:var(--muted-dark); }
.bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.shade { position:absolute; inset:0; background:linear-gradient(180deg, rgba(10,10,11,.6) 0%, rgba(10,10,11,0) 18%, rgba(10,10,11,0) 46%, rgba(10,10,11,.86) 66%, rgba(10,10,11,.97) 80%, rgba(10,10,11,.98) 100%); }
.crop { position:absolute; width:34px; height:34px; border-color:var(--paper); border-style:solid; opacity:.85; }
.paper .crop { border-color:var(--ink); }
.crop.tl { top:28px; left:28px; border-width:2px 0 0 2px; }
.crop.tr { top:28px; right:28px; border-width:2px 2px 0 0; }
.crop.bl { bottom:28px; left:28px; border-width:0 0 2px 2px; }
.crop.br { bottom:28px; right:28px; border-width:0 2px 2px 0; }
.top { position:absolute; top:56px; left:72px; right:72px; display:flex; justify-content:space-between; align-items:center; }
.brand { display:flex; align-items:center; gap:14px; }
.brand img { height:38px; }
.brand span { font-weight:800; font-stretch:125%; font-size:20px; letter-spacing:.04em; }
.bottom { position:absolute; left:72px; right:72px; bottom:72px; }
.rule { height:3px; width:96px; background:var(--accent); margin:22px 0; }
.specs { display:grid; grid-template-columns:150px 1fr 150px 1fr; row-gap:12px; column-gap:16px; margin-top:26px; padding-top:22px; border-top:1px solid rgba(242,241,238,.25); }
.paper .specs { border-top-color:rgba(10,10,11,.2); }
.specs .k { color:var(--muted); }
.paper .specs .k { color:var(--muted-dark); }
.tile { position:relative; overflow:hidden; background:var(--studio); }
.tile img { width:100%; height:100%; object-fit:cover; display:block; }
.label { font-size:14px; margin-top:12px; display:flex; justify-content:space-between; gap:12px; }
.button { display:inline-block; background:var(--paper); color:var(--ink); padding:22px 40px; font-weight:800; font-stretch:125%; text-transform:uppercase; font-size:26px; letter-spacing:.04em; }
`

const page = (w, h, accent, body, cls = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${css(w, h)} :root { --accent:${accent}; }</style></head><body class="${cls}">${body}
<div class="crop tl"></div><div class="crop tr"></div><div class="crop bl"></div><div class="crop br"></div></body></html>`

const top = (right, dark = false, y = 56) => `<div class="top" style="top:${y}px"><div class="brand"><img src="${logo(dark ? 'mark-black' : 'mark-white')}"><span>FINAL HEAVEN</span></div><div class="mono">${right}</div></div>`
const price = (now, was) => was ? `${now} <span class="was">${was}</span>` : now

const packs = {}
const post = (pack, name, html) => { (packs[pack] ??= {})[name] = { html, w: 1080, h: 1350 } }
const story = (pack, name, html) => { (packs[pack] ??= {})[name] = { html, w: 1080, h: 1920 } }

// A full-bleed photo with the name, one line and the spec rows underneath.
const pieceSlide = (accent, { photo, pos = '50% 30%', shift = 0, kicker, page: pg, name, line, specs }) => page(1080, 1350, accent, `
  <img class="bg" src="${photo}" style="object-position:${pos}; top:-${shift}px; height:calc(100% + ${shift}px);"><div class="shade"></div>
  ${top(pg)}
  <div class="bottom">
    <div class="mono accent">${kicker}</div>
    <div class="display" style="font-size:92px; margin-top:16px;">${name[0]}<br><span class="outline">${name[1]}</span></div>
    <div class="rule"></div>
    <div style="font-size:30px; font-weight:500; max-width:860px; line-height:1.25;">${line}</div>
    <div class="specs mono" style="font-size:15px;">${specs.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('')}</div>
  </div>`)

// ─── The Rose Line (ladies) ──────────────────────────────────────────────
const ROSE = '#D23A4E'
const ladies = [
  { shot: 'w-ringer-cream', store: ['rose-ringer-tee', 'rose-ringer-tee-cream-front'], name: ['Rose Ringer', 'Baby Tee'], short: 'Rose Ringer Tee / Cream',
    line: 'A small red rose under the mark. Fitted, with red ringer trim.', colour: 'Cream', trim: 'Red', fit: 'Fitted', pos: '50% 22%' },
  { shot: 'w-waffle-navy', store: ['rose-waffle-tank', 'rose-waffle-tank-navy-front'], name: ['Rose Waffle', 'Tank'], short: 'Rose Waffle Tank / Navy',
    line: 'Navy waffle knit. A cream rose over the heart.', colour: 'Navy', trim: 'Cream', fit: 'Fitted', pos: '50% 20%' },
  { shot: 'w-crop-white', store: ['heaven-sent-crop-top', 'heaven-sent-crop-top-white-front'], name: ['Heaven Sent', 'Crop Top'], short: 'Heaven Sent Crop / White',
    line: 'A rose with wings. Heaven sent.', colour: 'White', trim: 'Black', fit: 'Cropped', pos: '50% 18%', shift: 190 },
  { shot: 'w-longstem-black', store: ['long-stem-rose-tank', 'long-stem-rose-tank-black-front'], name: ['Long-Stem', 'Rose Tank'], short: 'Long-Stem Rose Tank / Black',
    line: 'One rose, growing out of the mark.', colour: 'Black', trim: 'White', fit: 'Fitted racer', pos: '50% 22%' },
  { shot: 'w-trio-pink', store: ['rose-trio-ringer-tee', 'rose-trio-ringer-tee-pink-front'], name: ['Rose Trio', 'Ringer Tee'], short: 'Rose Trio Tee / Pink',
    line: 'Three roses, set like the three stars.', colour: 'Dusty pink', trim: 'Burgundy', fit: 'Fitted', pos: '50% 12%' },
  { shot: 'w-rosetank-black', store: ['rose-tank', 'rose-tank-black-front'], name: ['Rose', 'Tank'], short: 'Rose Tank / Black & Red',
    line: 'Black rib, deep red trim, one red rose.', colour: 'Black', trim: 'Deep red', fit: 'Fitted', pos: '50% 20%' },
]
const LADIES_PRICE = price('₦17,000', '₦45,000')

post('rose-line', '01-cover', page(1080, 1350, ROSE, `
  ${top('The Rose Line — 01/10')}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:118px;">The <span class="accent">Rose</span><br><span class="outline">Line</span></div>
    <div class="mono muted" style="margin-top:20px;">Ladies · Six pieces · Sizes XS–L</div>
  </div>
  <div style="position:absolute; top:470px; left:72px; right:72px; display:grid; grid-template-columns:repeat(3, 1fr); gap:22px 18px;">
    ${ladies.map((p, i) => `<div>
      <div class="tile" style="height:300px;"><img src="${shot(p.shot)}" style="object-position:${p.pos}"></div>
      <div class="mono label" style="font-size:12px;"><span><span class="accent">0${i + 1}</span>&nbsp; ${p.name.join(' ')}</span></div>
    </div>`).join('')}
  </div>
  <div class="mono" style="position:absolute; bottom:64px; left:72px; right:72px; display:flex; justify-content:space-between; font-size:15px;"><span>₦17,000 each <span class="was">₦45,000</span></span><span class="muted">finalheaven.shop</span></div>
`))

ladies.forEach((p, i) => post('rose-line', `0${i + 2}-${p.store[0]}`, pieceSlide(ROSE, {
  photo: shot(p.shot), pos: p.pos, shift: p.shift, kicker: `Ladies · R.0${i + 1}`, page: `The Rose Line — 0${i + 2}/10`, name: p.name, line: p.line,
  specs: [['Colour', p.colour], ['Trim', p.trim], ['Fit', p.fit], ['Sizes', 'XS – L'], ['Price', LADIES_PRICE]],
})))

post('rose-line', '08-the-pieces', page(1080, 1350, ROSE, `
  ${top('The Rose Line — 08/10', true)}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:96px;">The <span class="accent">Pieces</span></div>
    <div class="mono muted" style="margin-top:14px;">All six, flat · Sizes XS–L</div>
  </div>
  <div style="position:absolute; top:330px; left:72px; right:72px; display:grid; grid-template-columns:repeat(3, 1fr); gap:28px 18px;">
    ${ladies.map((p, i) => `<div>
      <div class="tile" style="height:380px;"><img src="${product(...p.store)}"></div>
      <div class="mono" style="font-size:12px; margin-top:12px;"><span class="accent">R.0${i + 1}</span>&nbsp; ${p.short}</div>
    </div>`).join('')}
  </div>
`, 'paper'))

post('rose-line', '09-the-price', page(1080, 1350, ROSE, `
  <img class="bg" src="${shot('w-longstem-black')}" style="object-position:50% 25%; opacity:.35;">
  <div class="shade" style="background:linear-gradient(180deg, rgba(10,10,11,.7), rgba(10,10,11,.5) 40%, rgba(10,10,11,.95));"></div>
  ${top('The Rose Line — 09/10')}
  <div style="position:absolute; top:330px; left:72px; right:72px;">
    <div class="mono muted">Every piece in the line</div>
    <div class="display was" style="font-size:120px; margin-top:28px; text-decoration-thickness:8px;">₦45,000</div>
    <div class="display accent" style="font-size:200px; margin-top:18px;">₦17,000</div>
    <div class="rule"></div>
    <div style="font-size:34px; font-weight:500; line-height:1.25; max-width:820px;">Six pieces. Sizes XS to L. While they last.</div>
  </div>
`))

post('rose-line', '10-live-now', page(1080, 1350, ROSE, `
  <img src="${shot('w-trio-pink')}" style="position:absolute; left:0; right:0; bottom:0; width:100%; height:860px; object-fit:cover; object-position:50% 8%;">
  <div style="position:absolute; left:0; right:0; bottom:0; height:860px; background:linear-gradient(180deg, var(--ink) 0%, rgba(10,10,11,0) 14%, rgba(10,10,11,0) 50%, rgba(10,10,11,.92) 76%, rgba(10,10,11,.97) 100%);"></div>
  ${top('The Rose Line — 10/10')}
  <div style="position:absolute; top:150px; left:72px; right:72px;">
    <div class="display" style="font-size:132px;">The <span class="accent">Rose</span> Line</div>
    <div class="display outline" style="font-size:132px; -webkit-text-stroke-width:3px;">Is live</div>
  </div>
  <div class="bottom">
    <div class="specs mono" style="font-size:17px; grid-template-columns:200px 1fr;">
      <span class="k">Pieces</span><span>6</span>
      <span class="k">Price</span><span>${LADIES_PRICE}</span>
      <span class="k">Sizes</span><span>XS – L</span>
      <span class="k">Shop</span><span>finalheaven.shop · link in bio</span>
    </div>
  </div>
`))

// Stories: text and buttons stay between 250 px from the top and 340 px from the bottom.
story('rose-line', 'story-01-launch', page(1080, 1920, ROSE, `
  <img class="bg" src="${shot('w-ringer-cream')}" style="object-position:50% 30%;">
  <div class="shade" style="background:linear-gradient(180deg, rgba(10,10,11,.55) 0%, rgba(10,10,11,0) 22%, rgba(10,10,11,0) 48%, rgba(10,10,11,.9) 70%, rgba(10,10,11,.97) 100%);"></div>
  ${top('New · Ladies', false, 250)}
  <div style="position:absolute; left:72px; right:72px; bottom:340px;">
    <div class="display" style="font-size:132px;">The <span class="accent">Rose</span><br><span class="outline">Line</span></div>
    <div class="rule"></div>
    <div class="mono" style="font-size:22px;">Six pieces · XS–L · ₦17,000 <span class="was">₦45,000</span></div>
    <div class="button" style="margin-top:40px;">Shop the line</div>
  </div>
`))

story('rose-line', 'story-02-poll', page(1080, 1920, ROSE, `
  <img src="${shot('w-ringer-cream')}" style="position:absolute; top:0; left:0; width:100%; height:960px; object-fit:cover; object-position:50% 18%;">
  <img src="${shot('w-longstem-black')}" style="position:absolute; bottom:0; left:0; width:100%; height:960px; object-fit:cover; object-position:50% 22%;">
  <div style="position:absolute; left:0; right:0; top:900px; height:120px; background:var(--ink);"></div>
  ${top('Rose Line · Pick one', false, 250)}
  <div class="mono" style="position:absolute; left:72px; top:820px; background:var(--ink); padding:10px 16px;">A · Rose Ringer Tee</div>
  <div class="display" style="position:absolute; left:0; right:0; top:918px; text-align:center; font-size:84px;">Tee <span class="accent">or</span> tank?</div>
  <div class="mono" style="position:absolute; right:72px; top:1040px; background:var(--ink); padding:10px 16px;">B · Long-Stem Rose Tank</div>
`))

story('rose-line', 'story-03-price', page(1080, 1920, ROSE, `
  ${top('The Rose Line', false, 250)}
  <div style="position:absolute; top:400px; left:72px; right:72px;">
    <div class="display was" style="font-size:96px; text-decoration-thickness:6px;">₦45,000</div>
    <div class="display accent" style="font-size:190px; margin-top:10px;">₦17K</div>
    <div class="mono" style="margin-top:22px; font-size:20px;">Every piece · Sizes XS–L</div>
  </div>
  <div style="position:absolute; top:800px; left:72px; right:72px; display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
    ${ladies.map((p) => `<div class="tile" style="height:300px;"><img src="${shot(p.shot)}" style="object-position:${p.pos}"></div>`).join('')}
  </div>
  <div style="position:absolute; left:72px; right:72px; bottom:340px; text-align:center;"><div class="button">Shop the line</div></div>
`))

// ─── Outerwear (men) ─────────────────────────────────────────────────────
const outer = [
  ['broken-star-tracksuit', 'broken-star-tracksuit-cream-set', 'Broken Star Tracksuit', '₦65,000'],
  ['double-star-tracksuit', 'double-star-tracksuit-black-set', 'Double Star Tracksuit', '₦65,000'],
  ['football-track-jacket', 'football-track-jacket-red-front', 'Football Track Jacket', '₦45,000'],
  ['puffer-gilet', 'puffer-gilet-black-front', 'Puffer Gilet', '₦55,000'],
  ['varsity-jacket', 'varsity-jacket-black-back', 'Varsity Jacket', '₦85,000'],
  ['satin-bomber', 'satin-bomber-black-back', 'Satin Bomber', '₦60,000'],
]
const EMBER = '#E8613C'

post('outerwear', '01-cover', page(1080, 1350, EMBER, `
  ${top('Outerwear — 01/06')}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:108px;">Outer<span class="accent">wear</span></div>
    <div class="mono muted" style="margin-top:18px;">Tracksuits · Jackets · The broken-star tape</div>
  </div>
  <div style="position:absolute; top:360px; left:72px; right:72px; display:grid; grid-template-columns:repeat(3, 1fr); gap:24px 18px;">
    ${outer.map(([dir, f, n, pr], i) => `<div>
      <div class="tile" style="height:360px;"><img src="${product(dir, f)}"></div>
      <div class="mono label" style="font-size:12px;"><span><span class="accent">0${i + 1}</span>&nbsp; ${n}</span><span class="muted">${pr}</span></div>
    </div>`).join('')}
  </div>
  <div class="mono muted" style="position:absolute; bottom:64px; left:72px; right:72px; display:flex; justify-content:space-between; font-size:15px;"><span>Sizes S–XL</span><span>finalheaven.shop</span></div>
`))

post('outerwear', '02-broken-star-tracksuit', pieceSlide(EMBER, { photo: shot('m-brokenstar'), pos: '50% 30%', kicker: 'Tracksuit · O.01', page: 'Outerwear — 02/06',
  name: ['Broken Star', 'Tracksuit'], line: 'Cream and chocolate. The broken-star tape, sleeve to ankle.',
  specs: [['Set', 'Jacket + pants'], ['Colour', 'Cream & brown'], ['Sizes', 'S – XL'], ['Price', '₦65,000']] }))
post('outerwear', '03-double-star-tracksuit', pieceSlide(EMBER, { photo: shot('m-doublestar'), pos: '50% 30%', kicker: 'Tracksuit · O.02', page: 'Outerwear — 03/06',
  name: ['Double Star', 'Tracksuit'], line: 'All black. A double line with single stars between.',
  specs: [['Set', 'Jacket + pants'], ['Colour', 'Black'], ['Sizes', 'S – XL'], ['Price', '₦65,000']] }))
post('outerwear', '04-football-track-jacket', pieceSlide(EMBER, { photo: shot('m-football-red'), pos: '50% 30%', kicker: 'Jacket · O.03', page: 'Outerwear — 04/06',
  name: ['Football', 'Track Jacket'], line: 'A retro football cut. Crest on the chest, tape down both arms.',
  specs: [['Colours', 'Red · Black'], ['Sides', 'Mesh'], ['Sizes', 'S – XL'], ['Price', '₦45,000']] }))

post('outerwear', '05-the-rest', page(1080, 1350, EMBER, `
  ${top('Outerwear — 05/06', true)}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:96px;">On the <span class="accent">rack</span></div>
    <div class="mono muted" style="margin-top:14px;">Three more · All black · Sizes S–XL</div>
  </div>
  <div style="position:absolute; top:340px; left:72px; right:72px; display:grid; grid-template-columns:repeat(3, 1fr); gap:18px;">
    ${outer.slice(3).map(([dir, f, n, pr], i) => `<div>
      <div class="tile" style="height:640px;"><img src="${product(dir, f)}"></div>
      <div class="mono" style="font-size:13px; margin-top:14px;"><span class="accent">O.0${i + 4}</span>&nbsp; ${n}</div>
      <div class="mono" style="font-size:13px; margin-top:6px;">${pr}</div>
    </div>`).join('')}
  </div>
`, 'paper'))

post('outerwear', '06-live-now', page(1080, 1350, EMBER, `
  <img src="${shot('m-doublestar')}" style="position:absolute; left:0; right:0; bottom:0; width:100%; height:820px; object-fit:cover; object-position:50% 12%;">
  <div style="position:absolute; left:0; right:0; bottom:0; height:820px; background:linear-gradient(180deg, var(--ink) 0%, rgba(10,10,11,0) 12%, rgba(10,10,11,0) 52%, rgba(10,10,11,.92) 70%, rgba(10,10,11,.97) 100%);"></div>
  ${top('Outerwear — 06/06')}
  <div style="position:absolute; top:150px; left:72px; right:72px;">
    <div class="display" style="font-size:108px;">Outer<span class="accent">wear</span></div>
    <div class="display outline" style="font-size:108px; -webkit-text-stroke-width:3px;">Is live</div>
  </div>
  <div class="bottom">
    <div class="specs mono" style="font-size:16px; grid-template-columns:1fr auto 1fr auto;">
      ${outer.map(([, , n, pr]) => `<span class="k">${n}</span><span>${pr}</span>`).join('')}
    </div>
  </div>
`))

story('outerwear', 'story-01-launch', page(1080, 1920, EMBER, `
  <img class="bg" src="${shot('m-brokenstar')}" style="object-position:50% 30%;">
  <div class="shade" style="background:linear-gradient(180deg, rgba(10,10,11,.55) 0%, rgba(10,10,11,0) 22%, rgba(10,10,11,0) 52%, rgba(10,10,11,.9) 72%, rgba(10,10,11,.97) 100%);"></div>
  ${top('New · Outerwear', false, 250)}
  <div style="position:absolute; left:72px; right:72px; bottom:340px;">
    <div class="display" style="font-size:120px;">Broken<br><span class="outline">Star</span></div>
    <div class="rule"></div>
    <div class="mono" style="font-size:22px;">Tracksuit set · Cream & brown · ₦65,000</div>
    <div class="button" style="margin-top:40px;">Shop outerwear</div>
  </div>
`))

// ─── ₦17k print tees ─────────────────────────────────────────────────────
const tees = [
  ['seraph-spec-tee', 'seraph-spec-tee-white-back', 'Seraph 07 Spec', 'White'],
  ['awaken-tee', 'awaken-tee-black-back', 'Awaken', 'Black'],
  ['holy-ground-tee', 'holy-ground-tee-black-back', 'Holy Ground', 'Black'],
  ['seraph-helm-tee', 'seraph-helm-tee-black-back', 'Seraph Helm', 'Black'],
  ['celestial-glyphs-tee', 'celestial-glyphs-tee-black-back', 'Celestial Glyphs', 'Black'],
  ['heaven-blade-tee', 'heaven-blade-tee-black-back', 'Heaven Blade', 'Black'],
  ['chrome-flames-07-tee', 'chrome-flames-07-tee-black-back', 'Chrome Flames 07', 'Black'],
  ['heaven-outline-tee', 'heaven-outline-tee-black-back', 'Heaven Outline', 'Black'],
]
const TEE_PRICE = price('₦17,000', '₦45,000')

post('17k-tees', '01-cover', page(1080, 1350, EMBER, `
  ${top('Back prints — 01/05')}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:120px; white-space:nowrap;"><span class="accent">₦17K</span> <span class="outline">Tees</span></div>
    <div class="mono muted" style="margin-top:18px;">Eight back prints · Was ₦45,000</div>
  </div>
  <div style="position:absolute; top:380px; left:72px; right:72px; display:grid; grid-template-columns:repeat(4, 1fr); gap:22px 14px;">
    ${tees.map(([dir, f, n], i) => `<div>
      <div class="tile" style="height:330px;"><img src="${product(dir, f)}"></div>
      <div class="mono" style="font-size:11px; margin-top:10px;"><span class="accent">T.0${i + 1}</span>&nbsp; ${n}</div>
    </div>`).join('')}
  </div>
  <div class="mono muted" style="position:absolute; bottom:64px; left:72px; right:72px; display:flex; justify-content:space-between; font-size:15px;"><span>Relaxed oversized · S–XL</span><span>finalheaven.shop</span></div>
`))

post('17k-tees', '02-heaven-outline-tee', pieceSlide(EMBER, { photo: shot('w-heaven-outline'), pos: '50% 25%', kicker: 'Back print · T.08', page: 'Back prints — 02/05',
  name: ['Heaven', 'Outline Tee'], line: 'The city above, where faith meets tomorrow.',
  specs: [['Colour', 'Black'], ['Fit', 'Relaxed oversized'], ['Sizes', 'S – XL'], ['Price', TEE_PRICE]] }))
post('17k-tees', '03-holy-ground-tee', pieceSlide(EMBER, { photo: shot('m-holy-ground'), pos: '50% 22%', kicker: 'Back print · T.03', page: 'Back prints — 03/05',
  name: ['Holy Ground', 'Tee'], line: 'Fear is loud. Faith is quiet.',
  specs: [['Colour', 'Black'], ['Fit', 'Relaxed oversized'], ['Sizes', 'S – XL'], ['Price', TEE_PRICE]] }))

post('17k-tees', '04-the-artwork', page(1080, 1350, EMBER, `
  ${top('Back prints — 04/05', true)}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:96px;">The <span class="accent">Artwork</span></div>
    <div class="mono muted" style="margin-top:14px;">Every back print, flat</div>
  </div>
  <div style="position:absolute; top:330px; left:72px; right:72px; display:grid; grid-template-columns:repeat(4, 1fr); gap:30px 14px;">
    ${tees.map(([dir, f, n, c], i) => `<div>
      <div class="tile" style="height:360px;"><img src="${product(dir, f)}"></div>
      <div class="mono" style="font-size:11px; margin-top:10px;"><span class="accent">T.0${i + 1}</span>&nbsp; ${n}</div>
      <div class="mono muted" style="font-size:11px; margin-top:4px;">${c}</div>
    </div>`).join('')}
  </div>
`, 'paper'))

post('17k-tees', '05-live-now', page(1080, 1350, EMBER, `
  <img src="${shot('m-holy-ground')}" style="position:absolute; left:0; right:0; bottom:0; width:100%; height:820px; object-fit:cover; object-position:50% 25%;">
  <div style="position:absolute; left:0; right:0; bottom:0; height:820px; background:linear-gradient(180deg, var(--ink) 0%, rgba(10,10,11,0) 28%, rgba(10,10,11,0) 50%, rgba(10,10,11,.92) 76%, rgba(10,10,11,.97) 100%);"></div>
  ${top('Back prints — 05/05')}
  <div style="position:absolute; top:150px; left:72px; right:72px;">
    <div class="display" style="font-size:124px; white-space:nowrap;"><span class="accent">₦17K</span> Tees</div>
    <div class="display outline" style="font-size:124px; -webkit-text-stroke-width:3px;">Are live</div>
  </div>
  <div class="bottom">
    <div class="specs mono" style="font-size:17px; grid-template-columns:200px 1fr;">
      <span class="k">Prints</span><span>8</span>
      <span class="k">Price</span><span>${TEE_PRICE}</span>
      <span class="k">Sizes</span><span>S – XL</span>
      <span class="k">Shop</span><span>finalheaven.shop · link in bio</span>
    </div>
  </div>
`))

story('17k-tees', 'story-01-heaven-outline', page(1080, 1920, EMBER, `
  <img class="bg" src="${shot('w-heaven-outline')}" style="object-position:50% 30%; top:-180px; height:calc(100% + 180px);">
  <div class="shade" style="background:linear-gradient(180deg, rgba(10,10,11,.55) 0%, rgba(10,10,11,0) 22%, rgba(10,10,11,0) 52%, rgba(10,10,11,.9) 72%, rgba(10,10,11,.97) 100%);"></div>
  ${top('Back prints', false, 250)}
  <div style="position:absolute; left:72px; right:72px; bottom:340px;">
    <div class="display" style="font-size:120px;"><span class="accent">₦17K</span> <span class="outline">Tees</span></div>
    <div class="rule"></div>
    <div class="mono" style="font-size:22px;">Eight back prints · S–XL · <span class="was">₦45,000</span></div>
    <div class="button" style="margin-top:40px;">Shop the tees</div>
  </div>
`))

// ─── Ice: grillz, the Cuban bracelet and watches (post once they are in the store) ───
const ICE = '#4FA3D9'
const grillz = [
  ['iced-fang-grillz', 'iced-fang-grillz', 'Iced Fang'],
  ['star-grillz-set', 'star-grillz-set', 'Star Set'],
  ['rainbow-stone-grillz', 'rainbow-stone-grillz', 'Rainbow Stone'],
  ['round-stone-grillz', 'round-stone-grillz', 'Round Stone'],
  ['open-frame-iced-grillz', 'open-frame-iced-grillz', 'Open-Frame Iced'],
  ['blue-chrome-grillz', 'blue-chrome-grillz', 'Blue Chrome'],
]

post('ice', '01-cover', page(1080, 1350, ICE, `
  ${top('Ice — 01/05', true)}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:160px;"><span class="accent">Ice</span></div>
    <div class="mono muted" style="margin-top:14px;">Grillz · Full sets · Top and bottom</div>
  </div>
  <div style="position:absolute; top:400px; left:72px; right:72px; display:grid; grid-template-columns:repeat(3, 1fr); gap:24px 18px;">
    ${grillz.map(([dir, f, n], i) => `<div>
      <div class="tile" style="height:330px;"><img src="${product(dir, f)}" style="object-fit:cover; transform:scale(1.15);"></div>
      <div class="mono label" style="font-size:12px;"><span><span class="accent">G.0${i + 1}</span>&nbsp; ${n}</span><span class="muted">₦10,000</span></div>
    </div>`).join('')}
  </div>
  <div class="mono" style="position:absolute; bottom:64px; left:72px; right:72px; display:flex; justify-content:space-between; font-size:15px;"><span>Full sets ₦10,000</span><span class="muted">finalheaven.shop</span></div>
`, 'paper'))

post('ice', '02-cuban-bracelet', page(1080, 1350, ICE, `
  ${top('Ice — 02/05', true)}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:92px;">Iced <span class="accent">Cuban</span><br><span class="outline">Bracelet</span></div>
  </div>
  <div style="position:absolute; top:400px; left:72px; right:72px; display:grid; grid-template-columns:1fr 1fr; gap:18px;">
    <div class="tile" style="height:560px;"><img src="${product('iced-cuban-bracelet', 'iced-cuban-bracelet-gold')}"></div>
    <div class="tile" style="height:560px;"><img src="${product('iced-cuban-bracelet', 'iced-cuban-bracelet-silver')}"></div>
  </div>
  <div class="bottom">
    <div class="specs mono" style="font-size:15px; margin-top:0;">
      <span class="k">Colours</span><span>Gold · Silver</span>
      <span class="k">Price</span><span>₦20,000</span>
    </div>
  </div>
`, 'paper'))

post('ice', '03-single-grill', page(1080, 1350, ICE, `
  <div style="position:absolute; inset:0; background:var(--studio);"></div>
  <img src="${product('single-grill-cap', 'single-grill-cap')}" style="position:absolute; left:0; right:0; top:120px; width:100%; height:1000px; object-fit:cover;">
  ${top('Ice — 03/05', true)}
  <div class="bottom" style="color:var(--ink);">
    <div class="mono accent">Single · G.07</div>
    <div class="display" style="font-size:96px; margin-top:14px;">One tooth.<br><span class="outline">₦3,000</span></div>
    <div class="mono" style="margin-top:20px; font-size:15px; color:var(--muted-dark);">Gold or silver · Priced per piece</div>
  </div>
`, 'paper'))

post('ice', '04-wrist', page(1080, 1350, ICE, `
  ${top('Ice — 04/05', true)}
  <div style="position:absolute; top:140px; left:72px; right:72px;">
    <div class="display" style="font-size:96px;">On the <span class="accent">wrist</span></div>
  </div>
  <div style="position:absolute; top:300px; left:72px; right:72px; display:grid; grid-template-columns:1fr 1fr; gap:18px;">
    <div><div class="tile" style="height:640px;"><img src="${product('silver-tachymeter-watch', 'silver-tachymeter-watch-angle')}"></div>
      <div class="mono" style="font-size:13px; margin-top:14px;">Silver Tachymeter · Black dial</div><div class="mono" style="font-size:13px; margin-top:6px;">₦60,000</div></div>
    <div><div class="tile" style="height:640px;"><img src="${product('black-arabic-dial-watch', 'black-arabic-dial-watch-angle')}"></div>
      <div class="mono" style="font-size:13px; margin-top:14px;">Matte Black · Arabic dial</div><div class="mono" style="font-size:13px; margin-top:6px;">₦22,000 <span class="was">₦50,000</span></div></div>
  </div>
`, 'paper'))

post('ice', '05-live-now', page(1080, 1350, ICE, `
  <div style="position:absolute; inset:0; background:var(--studio);"></div>
  <img src="${product('iced-fang-grillz', 'iced-fang-grillz')}" style="position:absolute; left:0; right:0; bottom:0; width:100%; height:900px; object-fit:cover; object-position:50% 40%;">
  ${top('Ice — 05/05', true)}
  <div style="position:absolute; top:150px; left:72px; right:72px; color:var(--ink);">
    <div class="display" style="font-size:150px;"><span class="accent">Ice</span> is</div>
    <div class="display outline" style="font-size:150px; -webkit-text-stroke-width:3px;">In store</div>
  </div>
  <div class="bottom" style="color:var(--ink);">
    <div class="specs mono" style="font-size:16px; grid-template-columns:240px 1fr; background:rgba(236,234,230,.92); padding:22px 24px; margin:0 -24px;">
      <span class="k">Grillz, full set</span><span>₦10,000</span>
      <span class="k">Single grill</span><span>₦3,000</span>
      <span class="k">Cuban bracelet</span><span>₦20,000</span>
      <span class="k">Shop</span><span>finalheaven.shop · link in bio</span>
    </div>
  </div>
`, 'paper'))

// ─── Write and render ────────────────────────────────────────────────────
mkdirSync(htmlDir, { recursive: true })
const only = process.argv[2]
for (const [pack, files] of Object.entries(packs)) {
  if (only && pack !== only) continue
  mkdirSync(join(social, pack), { recursive: true })
  for (const [name, { html, w, h }] of Object.entries(files)) {
    const file = join(htmlDir, `${pack}--${name}.html`)
    writeFileSync(file, html)
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${w},${h}`,
      '--virtual-time-budget=8000', `--screenshot=${join(social, pack, `${name}.png`)}`, pathToFileURL(file).href], { stdio: 'ignore' })
    console.log(`${pack}/${name}.png`)
  }
}
