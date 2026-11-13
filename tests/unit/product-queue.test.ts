// The Product Worker's rules (scripts/product-queue-lib.mjs): the ten cases
// from the worker's test plan, with made-up products. Nothing here reads files,
// the network or the database.
import { describe, expect, it } from 'vitest'
import { allowed, outOfBounds, pricing, statusAfterValidation, summarize, validate } from '../../scripts/product-queue-lib.mjs'

const rules = {
  pricing: { target_gross_margin: 0.55, min_gross_margin: 0.35, round_to_ngn: 500 },
  categories: ['Ladies', 'Gadgets', 'Pants'],
  sized_categories: ['Ladies', 'Pants'],
  claims_to_review: ['genuine', 'MagSafe', 'self-defence'],
}
const good = () => ({
  name: 'Seamless Gym Shorts', category: 'Ladies', price: 12000, source_type: 'wholesale',
  description: 'High-waist seamless shorts in a stretchy, quick-dry knit, with drawstring ties at the sides.',
  sizes: ['S', 'M', 'L'], colors: ['Black', 'Coral'],
  photos: [{ file: 'black.jpg', color: 'Black' }, { file: 'coral.jpg', color: 'Coral' }],
  source: { listing_url: 'https://qr.1688.com/s/abc', unit_cost: 23, cost_currency: 'CNY', fx_rate: 223.57, supplier: { name: 'Yiwu Activewear Co.' } } as Record<string, unknown>,
})
const img = (hash: string, width = 1200, height = 1500) => ({ width, height, bytes: 100_000, hash })
const ctx = (over: Record<string, unknown> = {}) => ({
  slug: 'gym-shorts', files: ['product.json', 'black.jpg', 'coral.jpg'], others: [],
  images: { 'black.jpg': img('a'), 'coral.jpg': img('b') }, rules, ...over,
})

describe('product worker', () => {
  it('1. a valid product is ready for a draft, with its margin and a suggested price', () => {
    const r = validate(good(), ctx())
    expect(r.problems).toEqual([])
    expect(r.needs).toEqual([])
    expect(statusAfterValidation(undefined, r)).toBe('DRAFT_READY')
    expect(r.pricing.goods).toBe(5142)
    expect(r.pricing.suggested).toBe(11500) // 5142 / (1 - 0.55), up to the next ₦500
    expect(Math.round((r.pricing.margin ?? 0) * 100)).toBe(57)
  })

  it('2. missing specifications (sizes, description) need information, not invention', () => {
    const r = validate({ ...good(), sizes: [], description: 'Shorts.' }, ctx())
    expect(r.needs).toEqual(expect.arrayContaining(['sizes (from the supplier size chart)', expect.stringContaining('description')]))
    expect(statusAfterValidation(undefined, r)).toBe('NEEDS_INFORMATION')
  })

  it('3. missing shipping costs make the price provisional and say which costs are missing', () => {
    const r = pricing(good(), rules)
    expect(r.status).toBe('provisional')
    expect(r.missing).toEqual(['China domestic shipping', 'international shipping', 'customs and clearing'])
    const full = pricing({ ...good(), source: { ...good().source, china_domestic_ngn: 300, shipping_cost_ngn: 2000, customs_cost_ngn: 500 } }, rules)
    expect(full.status).toBe('complete')
    expect(full.landed).toBe(5142 + 2800)
    // No supplier price: no landed cost at all, and the product goes back for it.
    const none = validate({ ...good(), source: { cost_currency: 'CNY', fx_rate: 223.57 } }, ctx())
    expect(none.pricing.status).toBe('missing')
    expect(none.needs).toContain('supplier unit cost')
  })

  it('3b. with freight rules, freight comes from the packed weight, the card fee counts, and a price under the floor needs the owner', () => {
    const fr = {
      ...rules,
      pricing: { ...rules.pricing, target_gross_margin: 0.5, min_gross_margin: 0.45, enforce_floor: true, card_fee_pct: 0.014, card_fee_cap_ngn: 2000,
        freight: { air_usd_per_kg: 9, ngn_per_usd: 1550, packaging_factor: 1.1, sea_ngn_per_kg: null } },
    }
    const withWeight = (o: Record<string, unknown> = {}) => ({ ...good(), price: 20000, shipping: { weight_kg: 0.3 }, ...o })
    const r = pricing(withWeight(), fr)
    expect(r.freight).toBe(Math.round(0.3 * 1.1 * 9 * 1550)) // 4604
    expect(r.freightBasis).toBe('estimate')
    expect(r.fee).toBe(280)
    expect(r.landed).toBe(5142 + 4604)
    expect(Math.round((r.margin ?? 0) * 100)).toBe(50) // (20000 - 9746 - 280) / 20000
    expect(r.missing).not.toContain('international shipping')
    // The source's own freight figure wins over the estimate.
    expect(pricing(withWeight({ source: { ...good().source, shipping_cost_ngn: 1000 } }), fr).freight).toBe(1000)
    // No packed weight: freight is missing, and it says why.
    expect(pricing({ ...good(), price: 20000 }, fr).missing).toContain('packed weight (for freight)')
    // Sea-only with no sea rate: provisional, asking for the rate.
    expect(pricing(withWeight({ ships_by_air: false }), fr).missing).toContain('sea freight rate (₦ per kg, in worker-rules.json)')
    // Under the floor: blocks the draft with the price that keeps it, unless the owner approved it.
    const low = validate(withWeight({ price: 15000 }), ctx({ rules: fr }))
    expect(low.needs.join(' ')).toMatch(/under the 45% floor: ₦18,500 or more keeps it/)
    expect(validate(withWeight({ price: 15000, queue: { below_floor_approved: true } }), ctx({ rules: fr })).needs).toEqual([])
  })

  it('4. a product with the same name as another folder is a possible duplicate', () => {
    const r = validate(good(), ctx({ others: [{ slug: 'seamless-gym-shorts', name: 'Seamless gym shorts', listing_url: 'x' }] }))
    expect(r.problems[0]).toMatch(/possible duplicate/)
    expect(statusAfterValidation(undefined, r)).toBe('FAILED')
    // Same supplier listing, different product (another capacity): only a note.
    const other = validate(good(), ctx({ others: [{ slug: 'power-bank-10000', name: 'Something else', listing_url: 'https://qr.1688.com/s/abc' }] }))
    expect(other.problems).toEqual([])
    expect(other.notes.join()).toMatch(/same supplier listing/)
  })

  it('5. variants must be consistent: every photo colour exists, no repeats', () => {
    const r = validate({ ...good(), colors: ['Black', 'black'] }, ctx())
    expect(r.problems).toEqual(expect.arrayContaining(['colors has the same colour twice', expect.stringContaining('"Coral", which isn')]))
  })

  it('6. missing, tiny or repeated images are caught', () => {
    const r = validate(good(), ctx({ files: ['product.json', 'black.jpg'], images: { 'black.jpg': img('a', 400, 500) } }))
    expect(r.problems).toEqual(expect.arrayContaining(['photo coral.jpg is not in the folder', expect.stringContaining('too small to list')]))
    const same = validate(good(), ctx({ images: { 'black.jpg': img('x'), 'coral.jpg': img('x') } }))
    expect(same.problems).toContain('photos black.jpg and coral.jpg are the same image')
  })

  it('7. in a batch, one bad product does not hold up the rest', () => {
    const entries = [
      { status: statusAfterValidation(undefined, validate(good(), ctx())) },
      { status: statusAfterValidation(undefined, validate({ ...good(), price: 0 }, ctx())) },
      { status: statusAfterValidation(undefined, validate({ ...good(), photos: [] }, ctx())), problems: ['possible duplicate: x'] },
    ]
    expect(entries.map((e) => e.status)).toEqual(['DRAFT_READY', 'NEEDS_INFORMATION', 'FAILED'])
    expect(summarize(entries)).toMatchObject({ total: 3, prepared: 1, needs_information: 1, failed: 1, duplicates: 1 })
  })

  it('8. a failed draft can be retried once it validates again', () => {
    expect(allowed('draft', { status: 'FAILED', last_validation: { ok: true } }).ok).toBe(true)
    expect(allowed('draft', { status: 'FAILED', last_validation: { ok: false } }).ok).toBe(false)
    expect(allowed('draft', { status: 'NEEDS_INFORMATION', last_validation: { ok: false } }).ok).toBe(false)
  })

  it('9. a rejected product cannot be drafted, approved or published until reopened', () => {
    for (const step of ['draft', 'approve', 'publish']) expect(allowed(step, { status: 'REJECTED', last_validation: { ok: true } }).ok).toBe(false)
    expect(statusAfterValidation('REJECTED', validate(good(), ctx()))).toBe('REJECTED')
  })

  it('10. nothing is published without the owner approving it', () => {
    expect(allowed('publish', { status: 'AWAITING_APPROVAL' }).ok).toBe(false)
    expect(allowed('publish', { status: 'DRAFT_READY' }).ok).toBe(false)
    expect(allowed('publish', { status: 'APPROVED' }).ok).toBe(false) // no approval time recorded
    expect(allowed('publish', { status: 'APPROVED', approved_at: '2026-10-28T20:00:00Z' }).ok).toBe(true)
    expect(allowed('approve', { status: 'DRAFT_READY' }).ok).toBe(false) // a draft must be saved first
  })

  it('flags claims the store cannot stand behind, unless reviewed', () => {
    const p = { ...good(), description: `${good().description} Works with MagSafe. Genuine quality.` }
    expect(validate(p, ctx()).problems).toEqual(expect.arrayContaining([expect.stringContaining('"genuine"'), expect.stringContaining('"MagSafe"')]))
    expect(validate({ ...p, queue: { claims_reviewed: ['MagSafe', 'genuine'] } }, ctx()).problems).toEqual([])
  })

  it('a bought-in product needs its supplier logged', () => {
    const r = validate({ ...good(), source: { ...good().source, supplier: undefined } }, ctx())
    expect(r.needs).toContain('supplier (the shop name on its 1688 store page)')
  })

  it('an unknown cost blocks a draft unless the owner approved listing without it', () => {
    const noCost = { ...good(), source: { cost_currency: 'CNY', supplier: { name: 'X' } } }
    expect(validate(noCost, ctx()).needs).toContain('supplier unit cost')
    const approved = validate({ ...noCost, queue: { cost_unknown_approved: true } }, ctx())
    expect(approved.needs).toEqual([])
    expect(approved.notes.join()).toMatch(/owner approved/)
  })

  it('the guard reports only new changes outside the product folders', () => {
    const before = ['app/page.tsx', 'brand/catalog/a/product.json']
    const after = [...before, 'brand/catalog/b/product.json', 'tools/product-photos/crop.mjs', 'components/x.tsx']
    expect(outOfBounds(before, after, ['brand/catalog/', 'tools/product-photos/'])).toEqual(['components/x.tsx'])
  })
})
