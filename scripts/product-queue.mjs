// The Product Worker's queue: every folder in brand/catalog is one product,
// and its product.json carries a `queue` block (status, checks, pricing,
// history). Rules: scripts/product-queue-lib.mjs and brand/catalog/worker-rules.json.
// Saving and publishing go through scripts/add-product.mjs, nothing else.
//
//   node scripts/product-queue.mjs new <slug>                start a folder (RECEIVED)
//   node scripts/product-queue.mjs validate <slug...|--all>  checks, pricing → DRAFT_READY / NEEDS_INFORMATION / FAILED
//   node scripts/product-queue.mjs draft <slug...>           save as a draft in the store (not on sale) → AWAITING_APPROVAL
//   node scripts/product-queue.mjs approve <slug...>         the owner's go-ahead → APPROVED
//   node scripts/product-queue.mjs reject <slug> [reason]    → REJECTED
//   node scripts/product-queue.mjs publish <slug...>         APPROVED only: on sale, then checked live → PUBLISHED
//   node scripts/product-queue.mjs status <slug> <STATUS> [note]   set by hand (e.g. reopen a rejected product)
//   node scripts/product-queue.mjs list [STATUS]             one line per product, then the batch summary
//   node scripts/product-queue.mjs sync                      give folders from before the queue a status (reads the live store)
//   node scripts/product-queue.mjs guard start|check         did this run touch anything outside the product folders?
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync, execSync } from 'node:child_process'
import sharp from 'sharp'
import { STATUSES, allowed, statusAfterValidation, summarize, validate, outOfBounds } from './product-queue-lib.mjs'

const ROOT = 'brand/catalog'
const WORK = join(ROOT, '_worker')
const SITE = process.env.SITE_URL || 'https://www.finalheaven.shop'
const ALLOWED = [`${ROOT}/`, 'tools/product-photos/']
const rules = JSON.parse(readFileSync(join(ROOT, 'worker-rules.json'), 'utf8'))
const [cmd = 'list', ...args] = process.argv.slice(2)

mkdirSync(WORK, { recursive: true })
const now = () => new Date().toISOString()
const log = (slug, event, detail = {}) => appendFileSync(join(WORK, 'log.jsonl'), JSON.stringify({ at: now(), slug, event, ...detail }) + '\n')
const folders = () => readdirSync(ROOT).filter((d) => !d.startsWith('_') && existsSync(join(ROOT, d, 'product.json')))
const load = (slug) => JSON.parse(readFileSync(join(ROOT, slug, 'product.json'), 'utf8'))
const save = (slug, p) => writeFileSync(join(ROOT, slug, 'product.json'), JSON.stringify(p, null, 2) + '\n')
const setStatus = (slug, p, status, extra = {}) => {
  const q = (p.queue ??= {})
  const from = q.status ?? null
  Object.assign(q, extra, { status, updated: now() })
  q.history = [...(q.history ?? []), { at: q.updated, from, to: status, ...(extra.note ? { note: extra.note } : {}) }].slice(-20)
  save(slug, p)
  log(slug, 'status', { from, to: status, ...(extra.note ? { note: extra.note } : {}), ...(extra.error ? { error: extra.error } : {}) })
}
const slugsFrom = (a) => (a[0] === '--all' ? folders() : a)
const need = (slug) => { if (!existsSync(join(ROOT, slug, 'product.json'))) { console.error(`${slug}: no ${ROOT}/${slug}/product.json`); process.exitCode = 1; return false } return true }

async function imageFacts(slug, p) {
  const out = {}
  for (const ph of p.photos ?? []) {
    const f = join(ROOT, slug, ph.file)
    if (!existsSync(f)) continue
    try {
      const buf = readFileSync(f)
      const m = await sharp(buf).metadata()
      out[ph.file] = { width: m.width, height: m.height, bytes: buf.length, hash: createHash('sha256').update(buf).digest('hex') }
    } catch (e) {
      out[ph.file] = { width: 0, height: 0, bytes: 0, hash: null, error: e.message }
    }
  }
  return out
}

async function cmdValidate(slugs) {
  const all = folders().map((s) => ({ slug: s, ...load(s) }))
  for (const slug of slugs) {
    if (!need(slug)) continue
    const p = load(slug)
    const images = await imageFacts(slug, p)
    const others = all.filter((o) => o.slug !== slug).map((o) => ({ slug: o.slug, name: o.name, listing_url: o.source?.listing_url }))
    const r = validate(p, { slug, files: readdirSync(join(ROOT, slug)), others, images, rules })
    for (const [f, img] of Object.entries(images)) if (img.error) r.problems.push(`photo ${f} can't be read: ${img.error}`)
    // The store's own rules too (the same checks the admin form makes).
    const check = spawnSync(process.execPath, ['scripts/add-product.mjs', join(ROOT, slug)], { encoding: 'utf8' })
    // Name, category, price and photos are already covered above, in plainer words.
    const fixes = (check.stdout ?? '').split('\n').filter((l) => l.trim().startsWith('fix:')).map((l) => l.trim().slice(5))
      .filter((m) => !/^(name|category|price|photos):/.test(m))
    r.problems.push(...fixes)
    const status = statusAfterValidation(p.queue?.status, r)
    setStatus(slug, p, status, {
      last_validation: { at: now(), ok: !r.problems.length && !r.needs.length, problems: r.problems, needs: r.needs, notes: r.notes },
      pricing: r.pricing,
    })
    print(slug, p)
  }
}

function run(slug, mode) {
  const r = spawnSync(process.execPath, ['scripts/add-product.mjs', join(ROOT, slug), mode], { encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

async function cmdDraft(slugs) {
  for (const slug of slugs) {
    if (!need(slug)) continue
    let p = load(slug)
    const a = allowed('draft', p.queue)
    if (!a.ok) { console.log(`${slug}: not drafted (${a.why})`); continue }
    setStatus(slug, p, 'PROCESSING', { note: 'saving draft' })
    const r = run(slug, '--apply')
    p = load(slug) // add-product.mjs writes the id and photo links
    if (!r.ok) {
      setStatus(slug, p, 'FAILED', { error: r.out.split('\n').slice(-3).join(' '), attempts: (p.queue.attempts ?? 0) + 1 })
      console.log(`${slug}: FAILED, retry with \`draft ${slug}\` (uploaded photos are kept)\n${r.out}`)
      continue
    }
    setStatus(slug, p, 'AWAITING_APPROVAL', { store_id: p.id, note: 'draft saved, not on sale' })
    console.log(`${slug}: draft ${p.id} saved, AWAITING_APPROVAL`)
  }
}

async function cmdApprove(slugs) {
  for (const slug of slugs) {
    if (!need(slug)) continue
    const p = load(slug)
    const a = allowed('approve', p.queue)
    if (!a.ok) { console.log(`${slug}: not approved (${a.why})`); continue }
    setStatus(slug, p, 'APPROVED', { approved_at: now(), note: 'approved by the owner' })
    console.log(`${slug}: APPROVED`)
  }
}

async function cmdPublish(slugs) {
  for (const slug of slugs) {
    if (!need(slug)) continue
    let p = load(slug)
    const a = allowed('publish', p.queue)
    if (!a.ok) { console.log(`${slug}: not published (${a.why})`); continue }
    setStatus(slug, p, 'PUBLISHING')
    const r = run(slug, '--publish')
    p = load(slug)
    if (!r.ok) { setStatus(slug, p, 'FAILED', { error: r.out.split('\n').slice(-3).join(' '), attempts: (p.queue.attempts ?? 0) + 1 }); console.log(`${slug}: FAILED\n${r.out}`); continue }
    // Check it's really on sale: the public API only returns active products.
    const live = await fetch(`${SITE}/api/products/${p.id}`).then((res) => res.status).catch(() => 0)
    if (live === 200) { setStatus(slug, p, 'PUBLISHED', { store_id: p.id, published_at: now(), url: `${SITE}/product/${p.id}` }); console.log(`${slug}: PUBLISHED ${SITE}/product/${p.id}`) }
    else { setStatus(slug, p, 'FAILED', { error: `published, but ${SITE}/api/products/${p.id} answered ${live}`, attempts: (p.queue.attempts ?? 0) + 1 }); console.log(`${slug}: saved as active, but the live check answered ${live}: look at it`) }
  }
}

async function cmdSync() {
  for (const slug of folders()) {
    const p = load(slug)
    if (p.queue?.status) continue
    if (!p.id) { setStatus(slug, p, 'RECEIVED', { note: 'from before the queue' }); continue }
    const live = await fetch(`${SITE}/api/products/${p.id}`).then((r) => r.status).catch(() => 0)
    if (live === 200) setStatus(slug, p, 'PUBLISHED', { store_id: p.id, url: `${SITE}/product/${p.id}`, note: 'on sale before the queue existed' })
    else if (live === 404) setStatus(slug, p, 'AWAITING_APPROVAL', { store_id: p.id, note: 'saved as a draft before the queue existed' })
    else console.log(`${slug}: live check answered ${live}, left without a status`)
  }
  cmdList([])
}

function cmdNew([slug]) {
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug ?? '')) { console.error('Usage: new <slug> (lower case, digits, dashes)'); process.exit(1) }
  const dir = join(ROOT, slug)
  if (existsSync(join(dir, 'product.json'))) { console.error(`${slug} already exists: \`validate ${slug}\` instead`); process.exit(1) }
  mkdirSync(join(dir, 'supplier'), { recursive: true })
  const p = { ...JSON.parse(readFileSync(join(ROOT, '_template.json'), 'utf8')), ...rules.defaults }
  save(slug, p)
  setStatus(slug, p, 'RECEIVED')
  console.log(`${dir}/ created. Supplier originals go in ${dir}/supplier/ (never edited), store photos next to product.json.`)
}

function print(slug, p) {
  const q = p.queue ?? {}
  const pr = q.pricing
  const money = pr?.landed != null ? ` · landed ₦${pr.landed.toLocaleString()}${pr.status === 'provisional' ? ' (provisional)' : ''}${pr.margin != null ? ` · margin ${Math.round(pr.margin * 100)}%` : ''} · suggest ₦${pr.suggested?.toLocaleString()}` : ''
  console.log(`${(q.status ?? '—').padEnd(17)} ${slug}${p.id ? ` (${p.id})` : ''} · ₦${Number(p.price || 0).toLocaleString()}${money}`)
  const v = q.last_validation
  for (const m of v?.problems ?? []) console.log(`    fix:  ${m}`)
  for (const m of v?.needs ?? []) console.log(`    need: ${m}`)
  for (const m of v?.notes ?? []) console.log(`    note: ${m}`)
  if (pr?.missing?.length) console.log(`    costs not in yet: ${pr.missing.join(', ')}`)
  if (q.error) console.log(`    last error: ${q.error}`)
}

function cmdList([only]) {
  const entries = folders().map((slug) => { const p = load(slug); return { slug, p, status: p.queue?.status ?? 'RECEIVED', problems: p.queue?.last_validation?.problems } })
  for (const e of entries) if (!only || e.status === only) print(e.slug, e.p)
  const s = summarize(entries)
  console.log(`\n${s.total} products · ${s.prepared} prepared · ${s.awaiting_approval} awaiting approval · ${s.approved} approved · ${s.published} published · ${s.needs_information} need information · ${s.duplicates} possible duplicates · ${s.failed} failed · ${s.rejected} rejected`)
}

function changedPaths() {
  return execSync('git status --porcelain --untracked-files=all', { encoding: 'utf8' }).split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''))
}

function cmdGuard([step]) {
  const f = join(WORK, 'guard.json')
  if (step === 'start') { writeFileSync(f, JSON.stringify({ at: now(), paths: changedPaths() })); console.log('guard: noted the working tree'); return }
  if (!existsSync(f)) { console.error('guard: run `guard start` first'); process.exit(1) }
  const before = JSON.parse(readFileSync(f, 'utf8'))
  const bad = outOfBounds(before.paths, changedPaths(), ALLOWED)
  if (bad.length) { console.log(`guard: changed outside the product folders since ${before.at}:\n${bad.map((b) => `  ${b}`).join('\n')}`); process.exit(2) }
  console.log('guard: only product folders changed')
}

const commands = {
  new: () => cmdNew(args),
  validate: () => cmdValidate(slugsFrom(args)),
  draft: () => cmdDraft(slugsFrom(args)),
  approve: () => cmdApprove(args),
  reject: () => { const [slug, ...why] = args; if (need(slug)) { setStatus(slug, load(slug), 'REJECTED', { note: why.join(' ') || 'rejected by the owner' }); console.log(`${slug}: REJECTED`) } },
  publish: () => cmdPublish(args),
  status: () => {
    const [slug, status, ...note] = args
    if (!STATUSES.includes(status)) { console.error(`status: one of ${STATUSES.join(', ')}`); process.exit(1) }
    // Approval and publishing only through their own commands, which check the order of steps.
    if (['APPROVED', 'PUBLISHED', 'PUBLISHING'].includes(status)) { console.error(`use \`approve\` or \`publish\`, not status ${status}`); process.exit(1) }
    if (need(slug)) { setStatus(slug, load(slug), status, { note: note.join(' ') || 'set by hand' }); console.log(`${slug}: ${status}`) }
  },
  list: () => cmdList(args),
  summary: () => cmdList(['__none__']),
  sync: () => cmdSync(),
  guard: () => cmdGuard(args),
}
if (!commands[cmd]) { console.error(`Unknown command ${cmd}. Commands: ${Object.keys(commands).join(', ')}`); process.exit(1) }
await commands[cmd]()
