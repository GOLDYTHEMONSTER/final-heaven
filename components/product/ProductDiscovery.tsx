'use client'

import { useMemo } from 'react'
import { ProductRail } from '@/components/home/ProductRail'
import { useInterestStore } from '@/lib/stores/interestStore'
import { useHypeScores } from '@/lib/useHype'
import { COMPLEMENTS, buildProfile, rankProducts, type FeedProfile } from '@/lib/discovery'
import type { Product } from '@/lib/catalog'

const ROW = 4
const RECENT = 8
const buyable = (p: Product) => !p.purchase || p.purchase.state === 'available' || p.purchase.state === 'preorder'

/**
 * Below a product: ways to keep exploring, each row from a different angle,
 * and no product twice on the page.
 *   Complete the look   pieces from categories worn or used with this one
 *   You might also like  related by category and style, lifted by community
 *                        hype and by what this shopper has hyped
 *   Hyped right now      the community's most hyped products (while Hype is on)
 *   Recently viewed      this shopper's own trail
 * Rows with too little in them are left out.
 */
export function ProductDiscovery({ product, allProducts }: { product: Product; allProducts: Product[] }) {
  const { interests } = useInterestStore()
  const ids = useMemo(() => allProducts.map((p) => p.id), [allProducts])
  const { enabled: hypeOn, scores } = useHypeScores(ids)

  const rows = useMemo(() => {
    const others = allProducts.filter((p) => p.id !== product.id)
    const base = buildProfile(interests)
    const hype = Object.fromEntries(Object.entries(scores).map(([id, d]) => [id, d.score]))
    // This product's category and style tags lead; the shopper's own taste and community hype break ties.
    const profile: FeedProfile = {
      ...base,
      hype,
      categories: { ...base.categories, [product.category]: 10 },
      tags: { ...base.tags, ...Object.fromEntries((product.tags ?? []).map((t) => [t, 10])) },
    }
    const used = new Set<string>()
    const take = (list: Product[]) => { list.forEach((p) => used.add(p.id)); return list }

    // Pieces from the categories that go with this one, ranked by style match.
    const pairs = COMPLEMENTS[product.category] ?? []
    const lookProfile: FeedProfile = { ...profile, categories: Object.fromEntries(pairs.map((c, i) => [c, pairs.length - i])) }
    const look = take(rankProducts(others.filter((p) => pairs.includes(p.category) && buyable(p)), lookProfile, { seed: 3, limit: ROW }))

    // Close matches first (same category, or a shared style tag); only then the shopper's wider taste,
    // with things they haven't opened yet (what they have is in "Recently viewed").
    const ownTags = new Set(product.tags ?? [])
    const close = (p: Product) => p.category === product.category || (p.tags ?? []).some((t) => ownTags.has(t))
    const near = rankProducts(others.filter((p) => !used.has(p.id) && close(p)), profile, { seed: 1, limit: ROW })
    const rest = near.length < ROW
      ? rankProducts(others.filter((p) => !used.has(p.id) && !close(p) && !base.viewed.includes(p.id)), { ...base, hype }, { seed: 1, limit: ROW - near.length })
      : []
    const related = take([...near, ...rest])

    const hyped = take(others
      .filter((p) => !used.has(p.id) && scores[p.id])
      .sort((a, b) => scores[b.id].score - scores[a.id].score || scores[b.id].hypes - scores[a.id].hypes)
      .slice(0, ROW))

    const byId = new Map(allProducts.map((p) => [p.id, p]))
    const recent = [...interests.viewedProducts]
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .map((v) => byId.get(v.productId))
      .filter((p): p is Product => Boolean(p) && p!.id !== product.id && !used.has(p!.id))
      .slice(0, RECENT)

    // "Because you hyped …": the shopper's latest hype that shares this product's category or style.
    const tags = new Set(product.tags ?? [])
    const because = [...(interests.hypedProducts ?? [])].reverse()
      .find((h) => h.productId !== product.id && (h.category === product.category || h.tags.some((t) => tags.has(t))))
    const becauseName = because ? byId.get(because.productId)?.name : undefined

    return { pairs, look, related, hyped, recent, becauseName }
  }, [allProducts, product, interests, scores])

  const cat = product.category
  return (
    <div className="border-t border-final-light-gray/40">
      {rows.look.length >= 2 && (
        <ProductRail
          id="discover-look" kicker="Style it" title="Complete the look"
          description={`Pieces that go with ${product.name.split('—')[0].trim()}.`}
          href={`/shop?category=${encodeURIComponent(rows.pairs[0])}`} linkLabel={`Shop ${rows.pairs[0]}`}
          products={rows.look}
        />
      )}
      {rows.related.length >= 2 && (
        <ProductRail
          id="discover-related" kicker="More like this" title="You might also like"
          description={rows.becauseName ? `Because you hyped ${rows.becauseName}.` : 'Close in style, picked from what you’ve been browsing.'}
          href={`/shop?category=${encodeURIComponent(cat)}`} linkLabel={`More ${cat}`}
          products={rows.related}
        />
      )}
      {hypeOn && rows.hyped.length >= 2 && (
        <ProductRail
          id="discover-hyped" kicker="Community" title="Hyped right now"
          description="What shoppers are hyping the most."
          href="/shop" linkLabel="Shop all" products={rows.hyped}
        />
      )}
      {rows.recent.length >= 2 && (
        <ProductRail
          id="discover-recent" kicker="Your trail" title="Recently viewed"
          href="/shop" linkLabel="Shop all" products={rows.recent}
        />
      )}
    </div>
  )
}
