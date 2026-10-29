// The Product Worker's rules, kept pure so tests/unit/product-queue.test.ts
// can check them without touching files, the network or the database.
// The command line around them is scripts/product-queue.mjs.

export const STATUSES = [
  'RECEIVED', 'PROCESSING', 'NEEDS_INFORMATION', 'DRAFT_READY', 'AWAITING_APPROVAL',
  'APPROVED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'REJECTED',
]

// Statuses validation may not move a product out of: they mean a person or the
// database has already acted on it.
const SETTLED = ['AWAITING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED']

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const list = (v) => (Array.isArray(v) ? v : [])
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Landed cost, margin and a suggested price, from the product's own source
 * block and the rules file. Never fills in a missing figure: what's missing is
 * listed, and the result is "provisional" or "missing".
 */
export function pricing(p, rules) {
  const s = p.source ?? {}
  const missing = []
  const cost = s.unit_cost == null ? null : Number(s.unit_cost)
  if (cost == null || !Number.isFinite(cost)) missing.push('supplier unit cost')
  const fx = s.cost_currency === 'NGN' ? 1 : s.fx_rate == null ? null : Number(s.fx_rate)
  if (s.cost_currency !== 'NGN' && (fx == null || !Number.isFinite(fx))) missing.push(`exchange rate (₦ per ${s.cost_currency ?? 'CNY'})`)
  const extras = { china_domestic_ngn: 'China domestic shipping', shipping_cost_ngn: 'international shipping', customs_cost_ngn: 'customs and clearing' }
  const known = {}
  for (const [k, label] of Object.entries(extras)) {
    if (s[k] == null) missing.push(label)
    else known[k] = Number(s[k])
  }
  const other = Number(s.other_cost_ngn ?? 0)
  if (cost == null || fx == null) return { status: 'missing', missing, goods: null, landed: null, margin: null, suggested: null }

  const goods = cost * fx
  const landed = goods + Object.values(known).reduce((a, b) => a + b, 0) + other
  const price = Number(p.price)
  const gross = price > 0 ? price - landed : null
  const margin = price > 0 ? gross / price : null
  const target = Number(rules?.pricing?.target_gross_margin ?? 0.55)
  const step = Number(rules?.pricing?.round_to_ngn ?? 500)
  const suggested = Math.ceil(landed / (1 - target) / step) * step
  return {
    // Goods cost known but freight, customs or domestic shipping not: the margin is only on what's known.
    status: missing.length ? 'provisional' : 'complete',
    missing, goods: Math.round(goods), landed: Math.round(landed),
    gross: gross == null ? null : Math.round(gross), margin, suggested,
  }
}

/**
 * Everything that stops a reliable listing. `problems` block a draft (the
 * product would be wrong or duplicated), `needs` send it back for information,
 * `notes` are for the person approving.
 * ctx: { slug, files: string[] in the folder, others: [{ slug, name, listing_url }], images: { [file]: { width, height, bytes, hash } }, rules }
 */
export function validate(p, ctx) {
  const rules = ctx.rules ?? {}
  const problems = []
  const needs = []
  const notes = []

  if (!String(p.name ?? '').trim()) problems.push('name is empty')
  if (!String(p.category ?? '').trim()) problems.push('category is empty')
  else if (list(rules.categories).length && !list(rules.categories).includes(p.category)) notes.push(`new category "${p.category}" (not one of ${rules.categories.join(', ')})`)
  if (!(Number(p.price) > 0)) needs.push('selling price')
  if (String(p.description ?? '').trim().length < 60) needs.push('a description (at least a couple of sentences, from verified facts)')
  if (list(rules.sized_categories).includes(p.category) && !list(p.sizes).length) needs.push('sizes (from the supplier size chart)')
  // Every bought-in product is logged against its shop (Admin → Suppliers).
  if (['wholesale', 'distributor'].includes(p.source_type) && !String(p.source?.supplier?.name ?? '').trim()) needs.push('supplier (the shop name on its 1688 store page)')

  // Photos: present, used once, matching the colours.
  const photos = list(p.photos)
  if (!photos.length) problems.push('no photos')
  if (photos.length > 12) problems.push(`${photos.length} photos: 12 at most, split the range into themed listings`)
  const colors = list(p.colors)
  const seen = new Map()
  for (const ph of photos) {
    if (!ph.url && !ctx.files.includes(ph.file)) problems.push(`photo ${ph.file} is not in the folder`)
    if (ph.color != null && !colors.includes(ph.color)) problems.push(`photo ${ph.file} is for colour "${ph.color}", which isn't in colors`)
    const img = ctx.images?.[ph.file]
    if (img) {
      if (Math.min(img.width, img.height) < 600) problems.push(`photo ${ph.file} is ${img.width}×${img.height}: too small to list`)
      else if (Math.min(img.width, img.height) < 1000) notes.push(`photo ${ph.file} is ${img.width}×${img.height}: soft at full size`)
      if (Math.abs(img.width / img.height - 0.8) > 0.02) notes.push(`photo ${ph.file} isn't 4:5 (${img.width}×${img.height}); the store crops it`)
      if (img.hash && seen.has(img.hash)) problems.push(`photos ${seen.get(img.hash)} and ${ph.file} are the same image`)
      if (img.hash) seen.set(img.hash, ph.file)
    }
  }
  for (const c of colors) if (!photos.some((ph) => ph.color === c)) notes.push(`no photo shows ${c}`)
  if (new Set(colors.map(norm)).size !== colors.length) problems.push('colors has the same colour twice')
  if (new Set(list(p.sizes).map(norm)).size !== list(p.sizes).length) problems.push('sizes has the same size twice')

  // Duplicates: another folder with the same product, or the same listing sold twice.
  for (const o of ctx.others ?? []) {
    if (norm(o.name) && norm(o.name) === norm(p.name)) problems.push(`possible duplicate: "${o.name}" in ${o.slug}`)
    else if (o.listing_url && o.listing_url === p.source?.listing_url) notes.push(`same supplier listing as ${o.slug} (fine for a different capacity or style; check it isn't a repeat)`)
  }

  // Claims the store can't stand behind, or brands it doesn't sell.
  const text = `${p.name} ${p.description ?? ''} ${list(p.tags).join(' ')}`
  const cleared = list(p.queue?.claims_reviewed).map(norm)
  for (const term of list(rules.claims_to_review)) {
    if (cleared.includes(norm(term))) continue
    if (new RegExp(`\\b${escape(term)}\\b`, 'i').test(text)) problems.push(`check the claim "${term}": verify it, rephrase it, or add it to queue.claims_reviewed`)
  }

  const price = pricing(p, rules)
  // The owner may approve listing before the cost is known (queue.cost_unknown_approved): then it's a note, not a block.
  if (price.status === 'missing') {
    const gaps = price.missing.filter((m) => m.startsWith('supplier') || m.startsWith('exchange'))
    if (p.queue?.cost_unknown_approved) notes.push(`listed with ${gaps.join(' and ')} unknown (owner approved): margin unknown`)
    else needs.push(...gaps)
  }
  if (price.margin != null && price.margin < Number(rules?.pricing?.min_gross_margin ?? 0.35)) {
    notes.push(`gross margin ${Math.round(price.margin * 100)}% is under the ${Math.round(Number(rules?.pricing?.min_gross_margin ?? 0.35) * 100)}% floor`)
  }

  return { problems, needs, notes, pricing: price }
}

/** Where validation leaves a product. Settled statuses stay put unless something is now wrong. */
export function statusAfterValidation(current, result) {
  const bad = result.problems.length || result.needs.length
  if (SETTLED.includes(current)) return bad && current !== 'PUBLISHED' && current !== 'REJECTED' ? 'NEEDS_INFORMATION' : current
  if (result.problems.length) return 'FAILED'
  if (result.needs.length) return 'NEEDS_INFORMATION'
  return 'DRAFT_READY'
}

/** Which step may run on a product in this status, and why not. */
export function allowed(step, q) {
  const s = q?.status ?? 'RECEIVED'
  if (s === 'REJECTED') return { ok: false, why: 'rejected: reopen it first with `status <folder> RECEIVED`' }
  if (step === 'draft') return ['DRAFT_READY', 'AWAITING_APPROVAL', 'FAILED'].includes(s) && q?.last_validation?.ok
    ? { ok: true } : { ok: false, why: `status is ${s}: validate it first (it must pass)` }
  if (step === 'approve') return s === 'AWAITING_APPROVAL' ? { ok: true } : { ok: false, why: `status is ${s}: only a saved draft (AWAITING_APPROVAL) can be approved` }
  if (step === 'publish') return s === 'APPROVED' && q?.approved_at ? { ok: true } : { ok: false, why: `status is ${s}: only products the owner approved can be published` }
  return { ok: false, why: `unknown step ${step}` }
}

/** Counts for the batch summary. */
export function summarize(entries) {
  const by = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const e of entries) by[e.status] = (by[e.status] ?? 0) + 1
  return {
    total: entries.length,
    prepared: by.DRAFT_READY + by.AWAITING_APPROVAL + by.APPROVED,
    needs_information: by.NEEDS_INFORMATION,
    duplicates: entries.filter((e) => e.problems?.some((m) => m.startsWith('possible duplicate'))).length,
    failed: by.FAILED,
    awaiting_approval: by.AWAITING_APPROVAL,
    approved: by.APPROVED,
    published: by.PUBLISHED,
    rejected: by.REJECTED,
    by_status: by,
  }
}

/** Paths a worker run changed that it shouldn't have: anything outside its own folders. */
export function outOfBounds(before, after, allowedPrefixes) {
  const was = new Set(before)
  return after.filter((path) => !was.has(path) && !allowedPrefixes.some((pre) => path.startsWith(pre)))
}
