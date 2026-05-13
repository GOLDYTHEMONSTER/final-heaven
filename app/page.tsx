import { HeroSection } from '@/components/sections/HeroSection'
import { NewestDrops } from '@/components/sections/NewestDrops'
import { MembershipCTA } from '@/components/sections/MembershipCTA'
import { Layout } from '@/components/layout/Layout'

export default function Home() {
  return (
    <Layout>
      <main className="min-h-screen">
        <HeroSection />
        <NewestDrops />
        <MembershipCTA />
      </main>
    </Layout>
  )
} 