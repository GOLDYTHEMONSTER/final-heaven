import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const getSupabase = () => createSupabaseServerClient()

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { viewedCategories, viewedTags, limit = 4, excludeProductId } = body

    // Fetch all active products
    const { data: allProducts, error: fetchError } = await getSupabase()
      .from('products')
      .select('*')
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
    return NextResponse.json({ error: error.message, products: [] }, { status: 500 })
  }
}
