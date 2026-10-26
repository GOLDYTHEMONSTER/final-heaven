import type { Metadata } from 'next'
import Link from 'next/link'
import { Layout } from '@/components/layout/Layout'
import { CollectionCover } from '@/components/home/CollectionRail'
import { liveCollectionsWithProducts } from '@/lib/storefront'
import { log } from '@/lib/log'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Collections · Final Heaven',
  description: 'Curated edits from Final Heaven: originals, finds, accessories and new drops, grouped by mood.',
  alternates: { canonical: '/collections' },
}

export default async function CollectionsPage() {
  // A failed read shows the empty state (and is logged) rather than failing the page or a build.
  const items = (await liveCollectionsWithProducts().catch((error) => {
    log('error', 'collections.load_failed', { error: (error as Error)?.message ?? String(error) })
    return []
  })).filter((i) => i.products.length > 0)
  return (
    <Layout>
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-[0.24em] text-final-muted">Collections</p>
        <h1 className="display mt-2 text-4xl md:text-6xl">Shop by mood</h1>
        {items.length === 0 ? (
          <p className="mt-8 text-final-muted">
            No collections are live right now. <Link href="/shop" className="underline underline-offset-2 hover:text-final-off-white">Browse the whole shop</Link>.
          </p>
        ) : (
          <ul className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ collection, products }) => (
              <li key={collection.id}>
                <Link href={`/collections/${collection.slug}`} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-final-dark-gray">
                    <CollectionCover collection={collection} products={products} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold">{collection.title}</h2>
                    <span className="shrink-0 text-xs text-final-muted">{products.length} {products.length === 1 ? 'piece' : 'pieces'}</span>
                  </div>
                  {collection.description && <p className="mt-1 text-sm text-final-muted">{collection.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </Layout>
  )
}
