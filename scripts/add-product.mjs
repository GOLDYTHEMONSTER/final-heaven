// Adds or updates a product from a folder, with no deploy: photos go to
// Supabase Storage the way the admin uploader stores them (a 1200 px JPEG and
// its 640 px card copy, see lib/images sized()), the product is saved as a
// draft with its sourcing and packed weight, and the folder's product.json
// records the id and photo links so a second run updates instead of copying.
//
//   node scripts/add-product.mjs brand/catalog/<slug>             check only, writes nothing
//   node scripts/add-product.mjs brand/catalog/<slug> --apply     upload photos, save as draft
//   node scripts/add-product.mjs brand/catalog/<slug> --publish   put the saved draft on sale
//
// See brand/catalog/README.md for product.json. The database's own rules
// (lead time for made to order, sale price above price, ...) still apply.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const [dir, mode = '--check'] = process.argv.slice(2)
if (!dir || !['--check', '--apply', '--publish'].includes(mode)) {
  console.error('Usage: node scripts/add-product.mjs <folder> [--apply | --publish]')
  process.exit(1)
}

// Kept in step with app/api/admin/products/route.ts and lib/collections, lib/sourcing.
const SOURCE_TYPES = ['original', 'wholesale', 'independent', 'distributor', 'local_maker']
const FULFILMENTS = ['stock', 'made_to_order']
const COST_CURRENCIES = ['CNY', 'USD', 'NGN']
const IMAGE_PERMISSIONS = ['own', 'supplier_permitted', 'unknown']
const CARD_SIZES = ['large', 'medium', 'small']
const BUCKET = 'product-images'
const CARD_BUDGET = 80 * 1024
const DAY = /^\d{4}-\d{2}-\d{2}$/

const file = join(dir, 'product.json')
const p = JSON.parse(readFileSync(file, 'utf8'))
const problems = []
const notes = []
const need = (ok, message) => { if (!ok) problems.push(message) }
const list = (v) => (Array.isArray(v) ? v : [])

// The same checks the admin form makes.
need(typeof p.name === 'string' && p.name.trim() && p.name.length <= 200, 'name: required, up to 200 characters')
need(typeof p.category === 'string' && p.category.trim() && p.category.length <= 60, 'category: required')
need(Number(p.price) > 0, 'price: a positive number of naira')
need(p.original_price == null || Number(p.original_price) > Number(p.price), 'original_price: must be above price (it shows crossed out), or leave it out')
need(Number.isInteger(p.stock ?? 0) && (p.stock ?? 0) >= 0, 'stock: a whole number')
need(FULFILMENTS.includes(p.fulfilment ?? 'stock'), `fulfilment: one of ${FULFILMENTS.join(', ')}`)
need(SOURCE_TYPES.includes(p.source_type ?? 'original'), `source_type: one of ${SOURCE_TYPES.join(', ')}`)
need(p.card_size == null || CARD_SIZES.includes(p.card_size), `card_size: one of ${CARD_SIZES.join(', ')}`)
need(p.fulfilment !== 'made_to_order' || (Number.isInteger(p.lead_time_days) && p.lead_time_days >= 1 && p.lead_time_days <= 180), 'lead_time_days: 1–180 for made to order')
need(!p.preorder || DAY.test(p.preorder_ships_on ?? ''), 'preorder_ships_on: YYYY-MM-DD for a pre-order')
for (const key of ['colors', 'sizes', 'tags']) {
  need(list(p[key]).length <= 30 && list(p[key]).every((x) => typeof x === 'string' && x.trim() && x.length <= 60), `${key}: up to 30 names of up to 60 characters`)
}
const photos = list(p.photos)
need(photos.length >= 1 && photos.length <= 12, 'photos: 1 to 12')
for (const ph of photos) {
  need(ph.url || existsSync(join(dir, ph.file ?? '')), `photos: ${ph.file} is not in the folder`)
  need(ph.color == null || list(p.colors).includes(ph.color), `photos: colour "${ph.color}" is not one of the product's colours (spelling must match)`)
}
for (const c of list(p.colors)) if (!photos.some((ph) => ph.color === c)) notes.push(`no photo shows ${c}: choosing it won't change the picture`)
const s = p.source ?? null
if (s) {
  need(s.cost_currency == null || COST_CURRENCIES.includes(s.cost_currency), `source.cost_currency: one of ${COST_CURRENCIES.join(', ')}`)
  need(s.image_permission == null || IMAGE_PERMISSIONS.includes(s.image_permission), `source.image_permission: one of ${IMAGE_PERMISSIONS.join(', ')}`)
}
const w = p.shipping ?? null
const orderedIn = p.fulfilment === 'made_to_order' && ['wholesale', 'distributor'].includes(p.source_type)
if (orderedIn && !(Number(w?.weight_kg) > 0)) notes.push('no packed weight: Express charges the ₦2,500 base fee whatever the quantity')

// Margin, when the cost is known.
if (s?.unit_cost != null) {
  const cost = s.cost_currency === 'NGN' ? Number(s.unit_cost) : Number(s.unit_cost) * Number(s.fx_rate || NaN)
  const extra = ['shipping_cost_ngn', 'customs_cost_ngn', 'other_cost_ngn'].reduce((t, k) => t + Number(s[k] ?? 0), 0)
  if (Number.isFinite(cost)) notes.push(`landed cost ≈ ₦${Math.round(cost + extra).toLocaleString()} (goods ₦${Math.round(cost).toLocaleString()}), price ₦${Number(p.price).toLocaleString()}, gross margin ${Math.round((1 - (cost + extra) / p.price) * 100)}%`)
  else notes.push('unit cost given without fx_rate: margin unknown')
}

console.log(`${p.id ? `${p.id} ` : ''}${p.name} · ${p.category} · ₦${Number(p.price).toLocaleString()} · ${photos.length} photo(s)`)
for (const n of notes) console.log(`  note: ${n}`)
if (problems.length) {
  for (const m of problems) console.log(`  fix: ${m}`)
  process.exit(1)
}
if (mode === '--check') {
  console.log('  ok. Run again with --apply to upload the photos and save it as a draft.')
  process.exit(0)
}

// Writing: the service key, scoped to the storefront's own tenant and store.
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: store, error: storeError } = await db.from('stores').select('id, tenant_id').eq('slug', process.env.STOREFRONT_SLUG || 'final-heaven').single()
if (storeError) throw storeError
const save = () => writeFileSync(file, JSON.stringify(p, null, 2) + '\n')

if (mode === '--publish') {
  if (!p.id) throw new Error('Run --apply first: this product has not been saved yet.')
  const { data, error } = await db.from('products').update({ status: 'active' }).eq('id', p.id).eq('tenant_id', store.tenant_id).select('id, status').single()
  if (error) throw error
  console.log(`  on sale: ${data.id} is ${data.status}. https://www.finalheaven.shop/product/${data.id}`)
  process.exit(0)
}

// Photos: only those not uploaded yet.
const bucket = db.storage.from(BUCKET)
for (const ph of photos) {
  if (ph.url) continue
  const source = sharp(join(dir, ph.file)).rotate().flatten({ background: '#ffffff' })
  const main = await source.clone().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer()
  let card
  for (const quality of [80, 72, 64, 60]) {
    card = await source.clone().resize({ width: 640, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer()
    if (card.length <= CARD_BUDGET) break
  }
  const path = `${store.tenant_id}/${randomUUID()}`
  const put = (name, bytes) => bucket.upload(name, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  const a = await put(`${path}.jpg`, main)
  if (a.error) throw a.error
  const b = await put(`${path}-640.jpg`, card)
  if (b.error) { await bucket.remove([`${path}.jpg`]); throw b.error }
  ph.url = bucket.getPublicUrl(`${path}.jpg`).data.publicUrl
  save() // a failure later never uploads this photo twice
  console.log(`  uploaded ${ph.file} (${Math.round(main.length / 1024)} KB, card ${Math.round(card.length / 1024)} KB)`)
}

const columns = {
  name: p.name.trim(), category: p.category.trim(), description: p.description ?? null, price: Number(p.price),
  original_price: p.original_price ?? null, stock: p.stock ?? 0, colors: list(p.colors), sizes: list(p.sizes), tags: list(p.tags),
  images: photos.map((ph) => ({ url: ph.url, color: ph.color ?? null })), card_size: p.card_size ?? 'medium',
  is_new: p.is_new ?? true, is_limited: p.is_limited ?? false, fulfilment: p.fulfilment ?? 'stock',
  lead_time_days: p.lead_time_days ?? null, source_type: p.source_type ?? 'original',
  preorder: p.preorder ?? false, preorder_ships_on: p.preorder_ships_on ?? null, preorder_limit: p.preorder_limit ?? 0,
}
if (p.id) {
  // An update keeps the product's status: publishing is its own step.
  const { error } = await db.from('products').update(columns).eq('id', p.id).eq('tenant_id', store.tenant_id)
  if (error) throw error
  console.log(`  updated ${p.id}`)
} else {
  const id = `p${Date.now()}`
  const { error } = await db.from('products').insert({ id, ...columns, status: 'draft', tenant_id: store.tenant_id, store_id: store.id })
  if (error) throw error
  p.id = id
  save()
  console.log(`  saved ${id} as a draft`)
}
if (s) {
  const { error } = await db.from('product_sources').upsert({ product_id: p.id, tenant_id: store.tenant_id, cost_currency: 'CNY', image_permission: 'unknown', ...s }, { onConflict: 'product_id' })
  if (error) throw error
}
if (w && Number(w.weight_kg) > 0) {
  const { error } = await db.from('product_shipping_profiles').upsert({ product_id: p.id, tenant_id: store.tenant_id, variant: '', method: 'air', ...w }, { onConflict: 'product_id,variant' })
  if (error) throw error
}
console.log(`  check it in Admin → Products, then: node scripts/add-product.mjs ${dir} --publish`)
