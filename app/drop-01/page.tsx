import type { Metadata } from 'next'
import { Layout } from '@/components/layout/Layout'
import { Drop01 } from '@/components/sections/Drop01'

export const metadata: Metadata = {
  title: 'Drop 01 - Final Heaven',
  description: 'Eight tees, three hoodies and a trucker cap. ₦80,000 for the full set, or buy each piece on its own.',
}

export default function Drop01Page() {
  return (
    <Layout>
      <Drop01 />
    </Layout>
  )
}
