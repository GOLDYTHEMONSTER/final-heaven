'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FiArrowRight, FiUsers, FiClock, FiGift } from 'react-icons/fi'
import { LogoMark } from '@/components/ui/LogoMark'

const benefits = [
  { icon: FiClock, title: '24h early access', description: 'Shop new drops before anyone else.' },
  { icon: FiGift, title: 'Exclusive discounts', description: 'Up to 30% off member-only items.' },
  { icon: FiUsers, title: 'Private community', description: 'Join our members-only Discord server.' },
]

export function MembershipCTA() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 md:pb-28 lg:px-8" aria-labelledby="membership-heading">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.7 }}
        className="relative grid overflow-hidden rounded-2xl border border-final-off-white/10 bg-final-gray md:grid-cols-12"
      >
        <LogoMark
          size={560}
          className="pointer-events-none absolute -bottom-24 -right-16 h-[420px] w-auto opacity-[0.04] md:h-[560px]"
        />

        <div className="relative p-8 md:col-span-7 md:p-14">
          <h2 id="membership-heading" className="display text-4xl md:text-6xl">
            Join the
            <br />
            community
          </h2>
          <p className="mt-6 max-w-[42ch] text-final-muted md:text-lg">
            Early access to limited drops, member-only pieces and prices, and a community that cares about the details.
          </p>
          <Link href="/membership" className="btn-primary group mt-9">
            Become a member
            <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <ul className="relative grid content-center gap-8 border-t border-final-off-white/10 p-8 md:col-span-5 md:border-l md:border-t-0 md:p-14">
          {benefits.map(({ icon: Icon, title, description }) => (
            <li key={title} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-final-off-white/15">
                <Icon className="h-[18px] w-[18px] text-final-ember" strokeWidth={1.75} />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-final-muted">{description}</span>
              </span>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  )
}
