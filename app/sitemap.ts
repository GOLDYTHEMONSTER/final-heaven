import type { MetadataRoute } from 'next'
import { liveCollections, publicProducts, publishedBrands } from '@/lib/storefront'

export const revalidate = 3600

const SITE = process.env.SITE_URL || 'https://www.finalheaven.shop'

/** Public pages only: live products, collections and labels, plus the store's fixed pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, collections, brands] = await Promise.all([
    publicProducts().catch(() => []),
    liveCollections().catch(() => []),
    publishedBrands().catch(() => []),
  ])
  const fixed = ['', '/shop', '/collections', '/drop-01', '/shipping', '/returns', '/terms', '/privacy', '/contact']
  return [
    ...fixed.map((path) => ({ url: `${SITE}${path}`, changeFrequency: 'daily' as const, priority: path === '' ? 1 : 0.6 })),
    ...collections.map((c) => ({ url: `${SITE}/collections/${c.slug}`, changeFrequency: 'daily' as const, priority: 0.7 })),
    ...brands.map((b) => ({ url: `${SITE}/brands/${b.slug}`, changeFrequency: 'weekly' as const, priority: 0.5 })),
    ...products.map((p) => ({
      url: `${SITE}/product/${p.id}`, changeFrequency: 'weekly' as const, priority: 0.8,
      ...(p.createdAt ? { lastModified: new Date(p.createdAt) } : {}),
    })),
  ]
}
