import { handle } from '@/lib/api'
import { FEED_CACHE, feedCsv, feedRows } from '@/lib/ads/meta-feed'
import { publicProducts } from '@/lib/storefront'
import { getStorefront } from '@/lib/tenancy'

/**
 * The catalogue for Meta's scheduled feed (Commerce Manager reads this address
 * on a schedule). Public product data only: the active pieces someone can buy
 * now, with the prices from the database. Read through the public client, so
 * hidden categories and gift pieces are left out by RLS as well as by the
 * builder. The CDN keeps it an hour (lib/ads/meta-feed).
 */
export const GET = handle('feeds.meta_catalog', async () => {
  const store = await getStorefront()
  const rows = feedRows(await publicProducts(), {
    site: process.env.SITE_URL || 'https://www.finalheaven.shop', hiddenCategories: store.hiddenCategories, currency: store.currency,
  })
  return new Response(feedCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...FEED_CACHE } })
})
