'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FiArrowRight } from 'react-icons/fi'
import { LogoMark } from '@/components/ui/LogoMark'

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

      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-12 md:py-16 lg:px-8">
        <div className="order-2 md:order-1 md:col-span-7">
          <motion.p {...enter(0.15)} className="text-xs font-medium uppercase tracking-[0.24em] text-final-muted">
            Streetwear. Premium drops.
          </motion.p>

          <motion.h1 {...enter(0.22, 24)} className="display mt-5 text-[13vw] md:text-[7.5vw] xl:text-[7rem]">
            Final
            <br />
            Heaven
          </motion.h1>

          <motion.p {...enter(0.32)} className="mt-6 max-w-[34ch] text-base leading-relaxed text-final-muted md:text-lg">
            Limited-run streetwear, shoes and accessories, released in small drops.
          </motion.p>

          <motion.div {...enter(0.4)} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/shop" className="btn-primary group">
              Shop the drop
              <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link href="/membership" className="btn-secondary">
              Join the waitlist
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', bounce: 0, duration: 1.1 }}
          className="order-1 flex justify-center md:order-2 md:col-span-5 md:justify-end"
        >
          <LogoMark
            size={460}
            priority
            className="h-[150px] w-auto drop-shadow-[0_0_60px_rgb(255_255_255/0.12)] sm:h-[220px] md:h-[min(56vh,460px)]"
          />
        </motion.div>
      </div>
    </section>
  )
}
