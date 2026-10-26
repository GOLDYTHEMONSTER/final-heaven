import type { MetadataRoute } from 'next'

const SITE = process.env.SITE_URL || 'https://www.finalheaven.shop'

/** Everything public is crawlable; the admin, the API, carts and checkout aren't. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/cart', '/checkout', '/track-order', '/login', '/unsubscribe'] }],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
