import Link from 'next/link'
import { FiArrowRight } from 'react-icons/fi'
import { TiltedGridHero } from '@/components/ui/TiltedGridHero'
import { DROP_01_REEL } from '@/lib/drop-01'

/**
 * The curved Drop 01 reel on its own, with no text over it. Text goes above
 * and below in normal flow, so the swelling ends can never cover it. Tiles
 * are a large share of the band's height, so the band is only as tall as
 * the row needs.
 */
export function DropReelBand() {
  return (
    <TiltedGridHero
      images={DROP_01_REEL}
      speed={4.5}
      tileHeight={46}
      axis={50}
      curve={68}
      className="h-[40svh] min-h-[260px] max-h-[440px] w-full"
    />
  )
}

export function DropReel() {
  return (
    <section id="drop-01" aria-labelledby="drop-reel-title" className="scroll-mt-16 border-y border-final-light-gray/40 py-14 sm:py-20">
      <div className="px-4 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-final-ember">Drop 01 · Live now</p>
        <h2 id="drop-reel-title" className="display mt-4 text-[10vw] sm:text-6xl md:text-7xl">
          Three tees.
          <br />
          <span className="text-final-muted">A hoodie. A cap.</span>
        </h2>
      </div>
      <div className="my-6 sm:my-8">
        <DropReelBand />
      </div>
      <div className="flex flex-col items-center gap-4 px-4 text-center">
        <p className="max-w-md text-sm text-final-muted">₦80,000 for the full set, or buy each piece on its own.</p>
        <Link href="/drop-01" className="btn-primary group">
          See Drop 01
          <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  )
}
