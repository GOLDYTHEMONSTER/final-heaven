import Link from 'next/link'
import { FiArrowRight } from 'react-icons/fi'
import { TiltedGridHero } from '@/components/ui/TiltedGridHero'

// Close-ups alternate with flat-lays so each piece shows its print and its shape.
const IMAGES = [
  { src: '/drops/drop-01/reel-01-big-mark-close.jpg', alt: 'Close-up of the distressed black mark and ember flame on the Big Mark Tee' },
  { src: '/drops/drop-01/reel-02-varsity-flatlay.jpg', alt: 'Final Heaven 07 Varsity Hoodie laid flat, back print showing' },
  { src: '/drops/drop-01/reel-03-angel-wings-close.jpg', alt: 'Close-up of FINAL HEAVEN between the wings on the navy Angel Wings Tee' },
  { src: '/drops/drop-01/reel-04-move-in-faith-flatlay.jpg', alt: 'Move in Faith Hoodie laid flat, back print showing' },
  { src: '/drops/drop-01/reel-05-the-mark-close.jpg', alt: 'The three-star mark printed on the chest of a black hoodie' },
  { src: '/drops/drop-01/reel-06-big-mark-flatlay.jpg', alt: 'Big Mark Tee in cream laid flat, back print showing' },
  { src: '/drops/drop-01/reel-07-move-in-faith-close.jpg', alt: 'Close-up of cracked red FAITH with not fear written across it' },
  { src: '/drops/drop-01/reel-08-angel-wings-flatlay.jpg', alt: 'Angel Wings Tee in navy laid flat, back print showing' },
  { src: '/drops/drop-01/reel-09-varsity-close.jpg', alt: 'Close-up of the ember-trimmed 07 on the Varsity Hoodie' },
]

export function DropReel() {
  return (
    <section id="drop-01" aria-labelledby="drop-reel-title" className="scroll-mt-16 border-y border-final-light-gray/40">
      <TiltedGridHero
        images={IMAGES}
        speed={4.5}
        tileHeight={28}
        // Low enough, and curved gently enough, that the swelling ends stay clear of the headline.
        axis={60}
        curve={70}
        className="h-[78svh] min-h-[520px] max-h-[820px] w-full bg-final-black"
      >
        <div className="relative z-10 flex h-full flex-col items-center justify-between px-4 py-12 text-center sm:py-16">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-final-ember">Drop 01 · Live now</p>
            <h2 id="drop-reel-title" className="display mt-4 text-[11vw] sm:text-6xl md:text-7xl">
              Back prints.
              <br />
              <span className="text-final-muted">The mark up front.</span>
            </h2>
          </div>
          <div className="flex flex-col items-center gap-4">
            <p className="max-w-md text-sm text-final-muted">Two tees and two hoodies, 20 of each.</p>
            <Link href="/new-drops" className="btn-primary group">
              Shop Drop 01
              <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </TiltedGridHero>
    </section>
  )
}
