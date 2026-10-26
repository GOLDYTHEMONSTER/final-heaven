'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FiArrowRight } from 'react-icons/fi'
import { NeonMark } from '@/components/ui/NeonMark'

const settle = { type: 'spring', bounce: 0, duration: 0.8 } as const

// Staggered entry: the mark arrives first, then the copy reads top to bottom.
const enter = (delay: number, y = 16) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  transition: { ...settle, delay },
})

export function HeroSection() {

  return (
    <section className="relative isolate overflow-hidden pt-16">
      {/* Light falling from above the mark: static, one hue, no animation. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_72%_38%,rgb(255_255_255/0.07),transparent_70%)]"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 md:min-h-[72dvh] md:grid-cols-12 md:gap-10 md:py-16 lg:px-8">
        <div className="order-2 md:order-1 md:col-span-7">
          <motion.p {...enter(0.15)} className="text-xs font-medium uppercase tracking-[0.24em] text-final-muted">
            Originals · Labels · Accessories · Drops
          </motion.p>

          <motion.h1 {...enter(0.22, 24)} className="display mt-5 text-[13vw] md:text-[7.5vw] xl:text-[7rem]">
            Final
            <br />
            Heaven
          </motion.h1>

          <motion.p {...enter(0.32)} className="mt-6 max-w-[34ch] text-base leading-relaxed text-final-muted md:text-lg">
            Curated streetwear and accessories, Final Heaven originals and new drops, at prices that make sense.
          </motion.p>

          <motion.div {...enter(0.4)} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="#discover" className="btn-primary group">
              Explore the feed
              <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link href="/shop" className="btn-secondary">
              Shop all
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', bounce: 0, duration: 1.1 }}
          className="order-1 flex justify-center md:order-2 md:col-span-5 md:justify-end"
        >
          <NeonMark className="h-[110px] sm:h-[200px] md:h-[min(52vh,440px)]" />
        </motion.div>
      </div>
    </section>
  )
}
