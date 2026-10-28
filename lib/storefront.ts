import 'server-only'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import { getStorefront } from '@/lib/tenancy'
import { PUBLIC_PRODUCT_SELECT, paymentsState, storeToday, toPublicProduct, type Product } from '@/lib/catalog'
import { orderDayFor, productDelivery, supplyOf } from '@/lib/delivery'
import { collectionProducts, parseRule, type CollectionRule } from '@/lib/collections'

// Public catalogue reads, shared by the API routes and the server-rendered
// pages. All go through the public (anon) client, so RLS decides what shows:
// active products outside hidden and gift categories, published brands, and
// published collections inside their dates.

const MAX_PRODUCTS = 500

export type Collection = {
  id: string; slug: string; title: string; description: string | null; coverImage: string | null
  featured: boolean; startsAt: string | null; endsAt: string | null; rule: CollectionRule | null
}
export type Brand = { id: string; slug: string; name: string; description: string | null; logoUrl: string | null; website: string | null }

/** Active products, newest first, each with its purchase state. */
export async function publicProducts({ category, isNew }: { category?: string | null; isNew?: boolean } = {}): Promise<Product[]> {
  const store = await getStorefront()
  let query = createSupabasePublicClient().from('products').select(PUBLIC_PRODUCT_SELECT)
    .eq('store_id', store.storeId).eq('status', 'active')
  if (isNew) query = query.eq('is_new', true)
  if (category && category !== 'All') query = query.eq('category', category.slice(0, 60))
  const { data, error } = await query.order('created_at', { ascending: false }).limit(MAX_PRODUCTS)
  if (error) throw error
  const today = storeToday(store.timeZone)
  return (data || []).map((p) => toPublicProduct(p, today) as Product)
}

/** One active product with its delivery estimate, or null. */
export async function publicProduct(id: string): Promise<Product | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  const store = await getStorefront()
  const db = createSupabasePublicClient()
  const [{ data, error }, shop] = await Promise.all([
    db.from('products').select(PUBLIC_PRODUCT_SELECT).eq('store_id', store.storeId).eq('id', id).eq('status', 'active').maybeSingle(),
    db.from('stores').select('payments_open_on, purchases_paused').eq('id', store.storeId).single(),
  ])
  if (error) throw error
  if (shop.error) throw shop.error
  if (!data) return null
  const today = storeToday(store.timeZone)
  const product = toPublicProduct(data, today) as Product
  // Dates count from today, or from launch day while checkout waits for it.
  const payments = paymentsState({ paymentsOpenOn: shop.data.payments_open_on ?? null, purchasesPaused: shop.data.purchases_paused === true }, today)
  product.delivery = productDelivery(supplyOf(data, product.purchase!), orderDayFor(payments, today))
  return product
}

const toCollection = (r: Record<string, any>): Collection => ({
  id: r.id, slug: r.slug, title: r.title, description: r.description ?? null, coverImage: r.cover_image ?? null,
  featured: Boolean(r.featured), startsAt: r.starts_at ?? null, endsAt: r.ends_at ?? null, rule: parseRule(r.rule),
})

/** Live collections in display order. */
export async function liveCollections(): Promise<Collection[]> {
  const store = await getStorefront()
  const { data, error } = await createSupabasePublicClient().from('collections')
    .select('id, slug, title, description, cover_image, featured, starts_at, ends_at, rule')
    .eq('store_id', store.storeId).order('sort_order').order('created_at').limit(50)
  if (error) throw error
  return (data || []).map(toCollection)
}

/** A live collection with its products (hand-picked first, then its rule's matches), or null. */
export async function collectionBySlug(slug: string): Promise<{ collection: Collection; products: Product[] } | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null
  const store = await getStorefront()
  const db = createSupabasePublicClient()
  const { data, error } = await db.from('collections')
    .select('id, slug, title, description, cover_image, featured, starts_at, ends_at, rule, links:collection_products(product_id, position)')
    .eq('store_id', store.storeId).eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!data) return null
  const collection = toCollection(data)
  const products = await publicProducts()
  const picked = ((data.links as { product_id: string; position: number }[] | null) ?? []).map((l) => ({ productId: l.product_id, position: l.position }))
  return { collection, products: collectionProducts(products, picked, collection.rule) }
}

/** Every live collection with its products, for the homepage and the collections index. */
export async function liveCollectionsWithProducts(): Promise<{ collection: Collection; products: Product[] }[]> {
  const store = await getStorefront()
  const db = createSupabasePublicClient()
  const [{ data, error }, products] = await Promise.all([
    db.from('collections')
      .select('id, slug, title, description, cover_image, featured, starts_at, ends_at, rule, links:collection_products(product_id, position)')
      .eq('store_id', store.storeId).order('sort_order').order('created_at').limit(50),
    publicProducts(),
  ])
  if (error) throw error
  return (data || []).map((row) => {
    const collection = toCollection(row)
    const picked = ((row.links as { product_id: string; position: number }[] | null) ?? []).map((l) => ({ productId: l.product_id, position: l.position }))
    return { collection, products: collectionProducts(products, picked, collection.rule) }
  })
}

export type UpcomingDrop = { id: string; name: string; description: string | null; releaseDate: string; previewImage: string | null }

/** Published drops whose release day is still ahead (store time), soonest first. */
export async function upcomingDrops(): Promise<UpcomingDrop[]> {
  const store = await getStorefront()
  const { data, error } = await createSupabasePublicClient().from('drops')
    .select('id, name, description, release_date, preview_image')
    .eq('store_id', store.storeId).eq('status', 'published').gt('release_date', storeToday(store.timeZone))
    .order('release_date').limit(3)
  if (error) throw error
  return (data || []).map((d) => ({ id: d.id, name: d.name, description: d.description ?? null, releaseDate: d.release_date, previewImage: d.preview_image ?? null }))
}

/** A published label and its products, or null. */
export async function brandBySlug(slug: string): Promise<{ brand: Brand; products: Product[] } | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null
  const brand = (await publishedBrands()).find((b) => b.slug === slug)
  if (!brand) return null
  return { brand, products: (await publicProducts()).filter((p) => p.brand?.id === brand.id) }
}

/** Published labels, by name. */
export async function publishedBrands(): Promise<Brand[]> {
  const store = await getStorefront()
  const { data, error } = await createSupabasePublicClient().from('brands')
    .select('id, slug, name, description, logo_url, website').eq('store_id', store.storeId).order('name').limit(100)
  if (error) throw error
  return (data || []).map((b) => ({ id: b.id, slug: b.slug, name: b.name, description: b.description ?? null, logoUrl: b.logo_url ?? null, website: b.website ?? null }))
}
