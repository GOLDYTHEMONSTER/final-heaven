'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ProductCard } from '@/components/ui/ProductCard'
import { useInterestStore } from '@/lib/stores/interestStore'

interface Product {
  id: string
  name: string
  price: number
  originalPrice?: number
  image?: string
  images?: Array<{ url: string; color?: string }>
  category: string
  rating?: number
  reviews?: number
  isNew?: boolean
  isLimited?: boolean
  isTrending?: boolean
  cardSize?: 'large' | 'medium' | 'small'
  tags?: string[]
}

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
  const [recommendations, setRecommendations] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { interests } = useInterestStore()

  useEffect(() => {
    // Calculate recommendations based on user interests
    const calculateRecommendations = () => {
      if (interests.viewedProducts.length === 0 && interests.cartAdditions.length === 0) {
        // No user history - show trending products
        setRecommendations(
          allProducts
            .filter((p) => p.isTrending || p.isNew)
            .filter((p) => p.id !== currentProductId)
            .sort((a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0))
            .slice(0, limit)
        )
        return
      }

      const scores = new Map<string, number>()

      // Score all products based on user interests
      allProducts.forEach((product) => {
        if (product.id === currentProductId) return // Skip current product

        let score = 0

        // Check viewed products for category/tag matches
        interests.viewedProducts.forEach((view) => {
          // Category match
          if (view.category === product.category) {
            score += 10
          }

          // Tag matches
          if (product.tags && view.tags) {
            const sharedTags = product.tags.filter((tag) => view.tags.includes(tag))
            score += sharedTags.length * 5
          }

          // Time spent weight - if user spent time, it matters more
          if (view.timeSpent > 15000) {
            score += 3
          }
        })

        // Recent cart additions
        if (interests.cartAdditions.includes(product.id)) {
          score += 2
        }

        // Trending/New boost
        if (product.isTrending) score += 5
        if (product.isNew) score += 3

        // Rating boost for highly rated products
        if (product.rating && product.rating >= 4.5) {
          score += 2
        }

        if (score > 0) {
          scores.set(product.id, score)
        }
      })

      // If no scored products, show trending/new
      if (scores.size === 0) {
        setRecommendations(
          allProducts
            .filter((p) => p.id !== currentProductId)
            .sort((a, b) => {
              if (a.isTrending && !b.isTrending) return -1
              if (b.isTrending && !a.isTrending) return 1
              if (a.isNew && !b.isNew) return -1
              return 0
            })
            .slice(0, limit)
        )
        return
      }

      // Get top recommendations
      const topRecommendations = Array.from(scores.entries())
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(0, limit)
        .map(([productId]) => allProducts.find((p) => p.id === productId))
        .filter((p): p is Product => p !== undefined)

      setRecommendations(topRecommendations)
    }

    setIsLoading(true)
    calculateRecommendations()
    setIsLoading(false)
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
          <h2 className="text-4xl font-bold text-final-off-white mb-3">{title}</h2>
          <div className="h-1 w-16 bg-gradient-to-r from-final-accent to-transparent rounded-full" />
          <p className="text-final-off-white/60 mt-4 text-lg">{subtitle}</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
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
            className="px-8 py-3 bg-final-accent text-final-black font-semibold rounded-lg hover:bg-final-accent/90 transition-colors"
          >
            Explore More
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
