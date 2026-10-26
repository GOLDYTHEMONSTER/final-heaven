import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FiArrowLeft } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { ProductCard } from '@/components/ui/ProductCard'
import { collectionBySlug } from '@/lib/storefront'
import { formatDay } from '@/lib/catalog'

export const revalidate = 60

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const found = await collectionBySlug(params.slug)
  if (!found) return { title: 'Collection not found · Final Heaven' }
  const { collection, products } = found
  const image = collection.coverImage ?? products[0]?.images?.[0]?.url
  const description = collection.description ?? `${collection.title}: ${products.length} pieces at Final Heaven.`
  return {
    title: `${collection.title} · Final Heaven`,
    description,
    alternates: { canonical: `/collections/${collection.slug}` },
    openGraph: { title: collection.title, description, type: 'website', ...(image ? { images: [image] } : {}) },
  }
}

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const found = await collectionBySlug(params.slug)
  if (!found) notFound()
  const { collection, products } = found

  return (
    <Layout>
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <Link href="/collections" className="inline-flex items-center gap-1.5 text-sm text-final-muted hover:text-final-off-white">
          <FiArrowLeft className="h-4 w-4" /> All collections
        </Link>
        <div className="mt-6 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-final-muted">
            Collection · {products.length} {products.length === 1 ? 'piece' : 'pieces'}
            {collection.endsAt && ` · until ${formatDay(collection.endsAt.slice(0, 10), { day: 'numeric', month: 'long' })}`}
          </p>
          <h1 className="display mt-2 text-4xl md:text-6xl">{collection.title}</h1>
          {collection.description && <p className="mt-4 text-final-muted md:text-lg">{collection.description}</p>}
        </div>

        {products.length === 0 ? (
          <p className="mt-12 text-final-muted">
            Everything in this collection has gone for now. <Link href="/shop" className="underline underline-offset-2 hover:text-final-off-white">See what’s in the shop</Link>.
          </p>
        ) : (
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
          </ul>
        )}
      </main>
    </Layout>
  )
}
