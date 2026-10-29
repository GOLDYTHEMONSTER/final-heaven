import type { MetadataRoute } from 'next'

const SITE = process.env.SITE_URL || 'https://www.finalheaven.shop'

/** Everything public is crawlable; the API, carts and checkout aren't. The admin area isn't listed here (that would advertise it); its pages are noindex. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/cart', '/checkout', '/track-order', '/unsubscribe'] }],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
