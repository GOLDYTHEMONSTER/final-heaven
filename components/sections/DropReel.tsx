'use client'

import { useEffect, useState } from 'react'
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

/** "Three shirts. A hoodie. A cap." (the ₦80,000 set) with the line breaks kept on phones. */
export function DropHeadline({ as: Tag = 'h2', id }: { as?: 'h1' | 'h2'; id?: string }) {
  return (
    <Tag id={id} className="display mt-4 text-[8vw] sm:text-5xl md:text-6xl lg:text-7xl">
      Three shirts.
      <br />
      <span className="text-final-muted">A&nbsp;hoodie. A&nbsp;cap.</span>
    </Tag>
  )
}
