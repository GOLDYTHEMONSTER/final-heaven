'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FiArrowRight } from 'react-icons/fi'
import { TiltedGridHero } from '@/components/ui/TiltedGridHero'
import { DROP_01_REEL } from '@/lib/drop-01'
import { LAUNCH_WINDOW, formatDay } from '@/lib/catalog'
import { useLaunch } from '@/lib/useLaunch'

/**
 * The curved Drop 01 reel on its own, with no text over it: text sits above
 * and below in normal flow, so the swelling ends never cover it. Phones get a
 * gentler curve; a tile there spans so much of the arc that the full curve
 * pinches it into an hourglass.
 */
export function DropReelBand() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return (
    <TiltedGridHero
      images={DROP_01_REEL}
      speed={4.5}
      tileHeight={46}
      axis={50}
      curve={narrow ? 38 : 68}
      className="h-[40svh] min-h-[260px] max-h-[440px] w-full"
    />
  )
}

/**
 * The drop's status line. It follows the store: "Live now" only once checkout
 * is open; before that it says when it opens, so it never contradicts the
 * "Coming soon" launch gate. Just "Drop 01" while the state loads.
 */
export function DropKicker() {
  const launch = useLaunch()
  const when = launch?.opensOn ? formatDay(launch.opensOn) : LAUNCH_WINDOW
  return (
    <p className="text-xs font-medium uppercase tracking-[0.24em] text-final-ember">
      {!launch ? 'Drop 01' : launch.open ? 'Drop 01 · Live now' : `Drop 01 · Opening ${when}`}
    </p>
  )
}

/** "Eight tees. Three hoodies. A cap." with the line breaks kept on phones. */
export function DropHeadline({ as: Tag = 'h2', id }: { as?: 'h1' | 'h2'; id?: string }) {
  return (
    <Tag id={id} className="display mt-4 text-[8vw] sm:text-5xl md:text-6xl lg:text-7xl">
      Eight tees.
      <br />
      <span className="text-final-muted">Three&nbsp;hoodies. A&nbsp;cap.</span>
    </Tag>
  )
}

export function DropReel() {
  return (
    <section id="drop-01" aria-labelledby="drop-reel-title" className="scroll-mt-16 border-y border-final-light-gray/40 py-14 sm:py-20">
      <div className="px-4 text-center">
        <DropKicker />
        <DropHeadline id="drop-reel-title" />
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
