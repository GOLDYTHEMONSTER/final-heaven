'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ProductCard } from '@/components/ui/ProductCard'
import { useInterestStore } from '@/lib/stores/interestStore'
import { buildProfile, rankProducts } from '@/lib/discovery'
import type { Product } from '@/lib/catalog'

interface RecommendedProductsProps {
  currentProductId?: string // Exclude this product from suggestions
  allProducts: Product[]
  title?: string
  subtitle?: string
  limit?: number
  variant?: 'default' | 'compact'
  className?: string
}

export function RecommendedProducts({
  currentProductId,
  allProducts,
  title = 'Recommended For You',
  subtitle = 'Based on your browsing history',
  limit = 4,
  variant = 'default',
  className = ''
}: RecommendedProductsProps) {
  const { interests } = useInterestStore()

  // Ranked by lib/discovery: the current product's category and tags count most, so these are
  // genuinely related; the shopper's own browsing breaks ties; the diversity rule keeps one
  // category from filling the row.
  const recommendations = useMemo(() => {
    const base = buildProfile(interests)
    const current = allProducts.find((p) => p.id === currentProductId)
    const profile = current
      ? {
          ...base,
          categories: { ...base.categories, [current.category]: 10 },
          tags: { ...base.tags, ...Object.fromEntries((current.tags ?? []).map((t) => [t, 10])) },
        }
      : base
    return rankProducts(allProducts.filter((p) => p.id !== currentProductId), profile, { seed: 1, limit })
  }, [interests, allProducts, currentProductId, limit])

  if (recommendations.length === 0) {
    return null
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4 }
    }
  }

  if (variant === 'compact') {
    return (
      <section className={`py-12 px-4 sm:px-6 lg:px-8 ${className}`}>
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="mb-8"
          >
            <h3 className="text-2xl font-bold text-final-off-white mb-2">{title}</h3>
            <p className="text-final-off-white/60 text-sm">{subtitle}</p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {recommendations.map((product) => (
              <motion.div key={product.id} variants={itemVariants}>
                <ProductCard product={product} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    )
  }

  return (
    <section className={`py-16 px-4 sm:px-6 lg:px-8 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h2 className="display text-2xl sm:text-3xl md:text-5xl text-final-off-white">{title}</h2>
          <p className="mt-4 max-w-[60ch] text-final-muted">{subtitle}</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4"
        >
          {recommendations.map((product) => (
            <motion.div key={product.id} variants={itemVariants}>
              <ProductCard product={product} />
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="flex justify-center mt-12"
        >
          <Link
            href="/shop"
            className="btn-secondary"
          >
            Explore More
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
