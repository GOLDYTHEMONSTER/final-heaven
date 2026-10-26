import { HeroSection } from '@/components/sections/HeroSection'
import { DropReel } from '@/components/sections/DropReel'
import { ValueStrip } from '@/components/sections/ValueStrip'
import { DiscoveryFeed } from '@/components/sections/DiscoveryFeed'
import { MembershipCTA } from '@/components/sections/MembershipCTA'
import { CollectionRail } from '@/components/home/CollectionRail'
import { ProductRail } from '@/components/home/ProductRail'
import { LabelsSection } from '@/components/home/LabelsSection'
import { UpcomingDrops } from '@/components/home/UpcomingDrops'
import { Layout } from '@/components/layout/Layout'
import { liveCollectionsWithProducts, publicProducts, publishedBrands, upcomingDrops } from '@/lib/storefront'
import { log } from '@/lib/log'

// Rebuilt at most once a minute; the feed below loads per visitor.
export const revalidate = 60

/** A homepage section's data, or nothing if it can't load: one failing section never takes the page down. */
async function safely<T>(name: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load()
  } catch (error) {
    log('error', 'home.section_failed', { section: name, error: (error as Error)?.message ?? String(error) })
    return []
  }
}

export default async function Home() {
  const [collections, products, brands, drops] = await Promise.all([
    safely('collections', liveCollectionsWithProducts),
    safely('products', () => publicProducts()),
    safely('brands', publishedBrands),
    safely('drops', upcomingDrops),
  ])
  const originals = products.filter((p) => p.sourceType === 'original' && p.purchase?.state !== 'sold_out').slice(0, 8)

  return (
    <Layout>
      <main>
        <HeroSection />
        <DropReel />
        <CollectionRail items={collections} />
        <ValueStrip />
        <DiscoveryFeed />
        <ProductRail
          id="originals-heading" kicker="Made by us" title="Final Heaven Originals" href="/shop?source=original" linkLabel="All originals"
          description="Our own designs: the mark up front, the artwork on the back, printed in small runs."
          products={originals}
        />
        <LabelsSection brands={brands} />
        <UpcomingDrops drops={drops} />
        <MembershipCTA />
      </main>
    </Layout>
  )
}
