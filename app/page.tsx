import { HeroSection } from '@/components/sections/HeroSection'
import { ValueStrip } from '@/components/sections/ValueStrip'
import { NewestDrops } from '@/components/sections/NewestDrops'
import { MembershipCTA } from '@/components/sections/MembershipCTA'
import { Layout } from '@/components/layout/Layout'

export default function Home() {
  return (
    <Layout>
      <main>
        <HeroSection />
        <ValueStrip />
        <NewestDrops />
        <MembershipCTA />
      </main>
    </Layout>
  )
}
