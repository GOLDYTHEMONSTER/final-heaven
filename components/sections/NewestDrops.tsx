'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ProductCard } from '@/components/ui/ProductCard'
import { useProductStore } from '@/lib/stores/productStore'

export function NewestDrops() {
  const { getNewDrops } = useProductStore()
  const newestProducts = getNewDrops().slice(0, 6) // Show only first 6 new drops

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