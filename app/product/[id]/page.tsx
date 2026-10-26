import type { Metadata } from 'next'
import { publicProduct } from '@/lib/storefront'
import { CONDITION_LABELS, type Condition } from '@/lib/collections'
import { ProductView } from './ProductView'

// Re-rendered at most once a minute: price and availability in the metadata stay current.
export const revalidate = 60

const plain = (s: string | undefined, max = 160) => (s ?? '').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await publicProduct(params.id).catch(() => null)
  if (!product) return { title: 'Product not found · Final Heaven', robots: { index: false } }
  const image = product.images?.[0]?.url
  const description = plain(product.description) || `${product.name} at Final Heaven.`
  return {
    title: `${product.name} · Final Heaven`,
    description,
    alternates: { canonical: `/product/${product.id}` },
    openGraph: { title: product.name, description, type: 'website', ...(image ? { images: [image] } : {}) },
    twitter: { card: 'summary_large_image', title: product.name, description, ...(image ? { images: [image] } : {}) },
  }
}

/** schema.org Product: real price and availability only; no ratings (we have none). */
function structuredData(product: NonNullable<Awaited<ReturnType<typeof publicProduct>>>) {
  const site = process.env.SITE_URL || 'https://www.finalheaven.shop'
  const state = product.purchase?.state
  const availability = state === 'available' ? 'InStock' : state === 'preorder' ? 'PreOrder' : state === 'sold_out' ? 'SoldOut' : 'OutOfStock'
  const used = product.condition && !product.condition.startsWith('new_')
  const brand = product.brand?.name ?? (product.sourceType === 'original' ? 'Final Heaven' : null)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: plain(product.description, 5000) || undefined,
    image: (product.images ?? []).map((i) => new URL(i.url, site).toString()),
    sku: product.id,
    ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
    offers: {
      '@type': 'Offer',
      url: `${site}/product/${product.id}`,
      priceCurrency: 'NGN',
      price: product.price,
      availability: `https://schema.org/${availability}`,
      itemCondition: `https://schema.org/${used ? 'UsedCondition' : 'NewCondition'}`,
    },
    ...(product.condition ? { additionalProperty: [{ '@type': 'PropertyValue', name: 'Condition', value: CONDITION_LABELS[product.condition as Condition] }] } : {}),
  }
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await publicProduct(params.id).catch(() => null)
  return (
    <>
      {product && (
        <script
          type="application/ld+json"
          // JSON.stringify escapes quotes; "<" is escaped so the data can't close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(product)).replace(/</g, '\\u003c') }}
        />
      )}
      <ProductView params={params} />
    </>
  )
}
