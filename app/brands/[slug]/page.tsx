import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Layout } from '@/components/layout/Layout'
import { ProductCard } from '@/components/ui/ProductCard'
import { brandBySlug } from '@/lib/storefront'
import { sized } from '@/lib/images'

export const revalidate = 60

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const found = await brandBySlug(params.slug)
  if (!found) return { title: 'Label not found · Final Heaven' }
  const description = found.brand.description ?? `${found.brand.name} at Final Heaven.`
  return {
    title: `${found.brand.name} · Final Heaven`,
    description,
    alternates: { canonical: `/brands/${found.brand.slug}` },
    openGraph: { title: found.brand.name, description, ...(found.brand.logoUrl ? { images: [found.brand.logoUrl] } : {}) },
  }
}

/** An independent label we stock: who they are and what of theirs is in the shop. */
export default async function BrandPage({ params }: { params: { slug: string } }) {
  const found = await brandBySlug(params.slug)
  if (!found) notFound()
  const { brand, products } = found

  return (
    <Layout>
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-[0.24em] text-final-muted">Independent label</p>
        <div className="mt-3 flex items-center gap-5">
          {brand.logoUrl && (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-final-dark-gray">
              <Image src={sized(brand.logoUrl, 640)} alt={`${brand.name} logo`} fill unoptimized sizes="64px" className="object-contain" />
            </div>
          )}
          <h1 className="display text-4xl md:text-6xl">{brand.name}</h1>
        </div>
        {brand.description && <p className="mt-4 max-w-3xl text-final-muted md:text-lg">{brand.description}</p>}
        {brand.website && (
          <a href={brand.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm underline underline-offset-2 hover:text-final-off-white">
            Visit {brand.name}
          </a>
        )}

        {products.length === 0 ? (
          <p className="mt-12 text-final-muted">
            Nothing from {brand.name} is in stock right now. <Link href="/shop" className="underline underline-offset-2 hover:text-final-off-white">See the shop</Link>.
          </p>
        ) : (
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <li key={p.id} className="cv-card"><ProductCard product={p} /></li>)}
          </ul>
        )}
      </main>
    </Layout>
  )
}
