import { HeroSection } from '@/components/sections/HeroSection'
import { DropReel } from '@/components/sections/DropReel'
import { ValueStrip } from '@/components/sections/ValueStrip'
import { NewestDrops } from '@/components/sections/NewestDrops'
import { MembershipCTA } from '@/components/sections/MembershipCTA'
import { Layout } from '@/components/layout/Layout'

export default function Home() {
  return (
    <Layout>
      <main>
        <HeroSection />
        <DropReel />
        <ValueStrip />
        <NewestDrops />
        <MembershipCTA />
      </main>
    </Layout>
  )
}
