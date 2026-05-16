'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ProductCard } from '@/components/ui/ProductCard'

export function NewestDrops() {
  const [newestProducts, setNewestProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadNewestDrops() {
      try {
        setLoading(true)
        const res = await fetch('/api/products?isNew=true')
        const data = await res.json()
        setNewestProducts((data.products || []).slice(0, 6))
      } catch (error) {
        console.error('Failed to load newest drops:', error)
      } finally {
        setLoading(false)
      }
    }

    loadNewestDrops()
  }, [])

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-final-gray via-final-dark-gray to-final-black">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-final-off-white mb-4">
            <span className="gradient-text">NEWEST</span> DROPS
          </h2>
          <p className="text-xl text-final-off-white/70 max-w-2xl mx-auto">
            Fresh from the underground. Limited quantities. 
            <span className="text-final-accent font-semibold"> Members get 24h early access.</span>
          </p>
        </motion.div>

        {/* Products Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 border-4 border-final-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-final-off-white/70">Loading latest drops...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
            {newestProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        )}

        {/* View All Button */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Link href="/new-drops">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-final-accent text-final-black px-8 py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
            >
              VIEW ALL NEW DROPS
            </motion.button>
          </Link>
        </motion.div>
      </div>
    </section>
  )
} 