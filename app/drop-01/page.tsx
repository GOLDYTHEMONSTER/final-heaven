import type { Metadata } from 'next'
import { Layout } from '@/components/layout/Layout'
import { Drop01 } from '@/components/sections/Drop01'

export const metadata: Metadata = {
  title: 'Drop 01 - Final Heaven',
  description: 'Three shirts, a hoodie and a cap for ₦80,000, or buy each piece on its own. Plus the ladies’ line and tracksuits.',
}

export default function Drop01Page() {
  return (
    <Layout>
      <Drop01 />
    </Layout>
  )
}
