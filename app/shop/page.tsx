import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Layout } from '@/components/layout/Layout'
import { ShopView } from './ShopView'

export const metadata: Metadata = {
  title: 'Shop - Final Heaven',
  description: 'Every Final Heaven piece: tees, hoodies, caps and more. Search, filter and sort the whole shop.',
}

export default function ShopPage() {
  // ShopView reads its filters from the URL, which needs a Suspense boundary.
  return (
    <Layout>
      <Suspense fallback={<div className="min-h-screen bg-final-black pt-24" />}>
        <ShopView />
      </Suspense>
    </Layout>
  )
}
