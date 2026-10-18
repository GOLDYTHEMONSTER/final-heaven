import { NextResponse } from 'next/server'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import { getStorefront } from '@/lib/tenancy'

const getSupabase = () => createSupabasePublicClient()
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [])

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const viewedCategories = strings(body?.viewedCategories)
    const viewedTags = strings(body?.viewedTags)
    const limit = Math.min(Math.max(Number.isInteger(body?.limit) ? body.limit : 4, 1), 12)
    const excludeProductId = typeof body?.excludeProductId === 'string' ? body.excludeProductId : undefined

    // Fetch all active products
    const { data: allProducts, error: fetchError } = await getSupabase()
      .from('products')
      .select('*')
      .eq('store_id', (await getStorefront()).storeId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (fetchError) throw fetchError

    if (!allProducts || allProducts.length === 0) {
      return NextResponse.json({ products: [] })
    }

    // Score products based on match with viewed categories and tags
    const scoredProducts = allProducts
      .filter((product) => product.id !== excludeProductId)
      .map((product) => {
        let score = 0

        // Category matching (highest priority)
        if (viewedCategories && viewedCategories.includes(product.category)) {
          score += 15
        }

        // Tag matching
        if (viewedTags && product.tags) {
          const productTags = Array.isArray(product.tags) ? product.tags : []
          const sharedTags = productTags.filter((tag: string) => viewedTags.includes(tag))
          score += sharedTags.length * 8
        }

        // Trending products get a boost
        if (product.is_trending) {
          score += 5
        }

        // New products get a boost
        if (product.is_new) {
          score += 3
        }

        // High ratings get a boost
        if (product.rating && product.rating >= 4.5) {
          score += 2
        }

        return { ...product, score }
      })
      .filter((product) => product.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...product }) => product)

    return NextResponse.json({ products: scoredProducts })
  } catch (error: any) {
    console.error('Error fetching suggestions:', error)
    return NextResponse.json({ error: 'Something went wrong.', products: [] }, { status: 500 })
  }
}
