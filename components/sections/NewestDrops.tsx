'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { FiArrowRight, FiRotateCw } from 'react-icons/fi'
import { ProductCard } from '@/components/ui/ProductCard'

type Status = 'loading' | 'ready' | 'error'

function ProductSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton aspect-[3/4] rounded-xl" />
      <div className="skeleton mt-3 h-3 w-16 rounded" />
      <div className="skeleton mt-2 h-4 w-3/4 rounded" />
      <div className="skeleton mt-2 h-4 w-20 rounded" />
    </div>
  )
}

export function NewestDrops() {
  const [newestProducts, setNewestProducts] = useState<any[]>([])
  const [status, setStatus] = useState<Status>('loading')

  const loadNewestDrops = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/products?isNew=true')
      if (!res.ok) throw new Error(`Request failed with ${res.status}`)
      const data = await res.json()
      setNewestProducts((data.products || []).slice(0, 4))
      setStatus('ready')
    } catch (error) {
      console.error('Failed to load newest drops:', error)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadNewestDrops()
  }, [loadNewestDrops])

  return (
    <section className="py-20 md:py-28" aria-labelledby="newest-drops-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <h2 id="newest-drops-heading" className="display text-4xl md:text-6xl">
              Newest <span className="heading-muted">drops</span>
            </h2>
            <p className="mt-4 max-w-[48ch] text-final-muted">
              Fresh from the underground. Limited quantities, and members get 24 hours early access.
            </p>
          </div>
          <Link
            href="/new-drops"
            className="group hidden shrink-0 items-center gap-2 text-sm font-semibold uppercase tracking-[0.06em] text-final-off-white sm:inline-flex"
          >
            View all new drops
            <FiArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {status === 'loading' && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4" role="status" aria-label="Loading newest drops">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-xl border border-final-off-white/10 px-6 py-16 text-center">
            <p className="text-lg font-semibold">We couldn&apos;t load the latest drops.</p>
            <p className="mt-2 text-final-muted">Check your connection and try again.</p>
            <button type="button" onClick={loadNewestDrops} className="btn-secondary mt-6">
              <FiRotateCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && newestProducts.length === 0 && (
          <div className="rounded-xl border border-dashed border-final-off-white/15 px-6 py-16 text-center">
            <p className="text-lg font-semibold">No drops live right now.</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-final-muted">
              New pieces land weekly. Members hear about them first.
            </p>
            <Link href="/membership" className="btn-primary mt-6">
              Become a member
            </Link>
          </div>
        )}

        {status === 'ready' && newestProducts.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {newestProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.6, delay: (index % 4) * 0.06 }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        )}

        <Link href="/new-drops" className="btn-secondary mt-10 w-full sm:hidden">
          View all new drops
        </Link>
      </div>
    </section>
  )
}
