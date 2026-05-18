'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FiFilter, FiGrid, FiList, FiSearch } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { ProductCard } from '@/components/ui/ProductCard'

const categories = ['All', 'Hoodies', 'T-Shirts', 'Pants', 'Jackets', 'Sweaters', 'Shoes', 'Accessories', 'Vapes']
const sortOptions = [
  { value: 'newest', label: 'Newest First' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'popular', label: 'Most Popular' }
]

export default function ShopPage() {
  const [products, setProducts] = useState<any[]>([])
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [sortBy, setSortBy] = useState('newest')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true)
        const res = await fetch('/api/products')
        const data = await res.json()
        setProducts(data.products || [])
      } catch (error) {
        console.error('Failed to load products:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProducts()
  }, [])

  const filteredProducts = products
    .filter(product => {
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.description?.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesCategory && matchesSearch
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.releaseDate || '0').getTime() - new Date(a.releaseDate || '0').getTime()
        case 'price-low':
          return a.price - b.price
        case 'price-high':
          return b.price - a.price
        case 'rating':
          return (b.rating || 0) - (a.rating || 0)
        case 'popular':
          return (b.sales || 0) - (a.sales || 0)
        default:
          return 0
      }
    })

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="text-5xl md:text-6xl font-bold text-final-off-white mb-6">
                <span className="gradient-text">SHOP</span> ALL
              </h1>
              <p className="text-xl text-final-off-white/70 max-w-3xl mx-auto">
                Discover the complete Final Heaven collection. Shop streetwear, shoes, accessories, and vapor lifestyle pieces in one place.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Filters and Controls */}
        <section className="px-4 sm:px-6 lg:px-8 pb-12">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30"
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                        selectedCategory === category
                          ? 'bg-final-accent text-final-black'
                          : 'bg-final-gray text-final-off-white hover:bg-final-accent hover:text-final-black'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {/* Search and Sort Controls */}
                <div className="flex items-center gap-4">
                  {/* Search */}
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-final-off-white/50 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-final-gray border border-final-light-gray/30 rounded-lg text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent"
                    />
                  </div>

                  {/* Sort Dropdown */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {/* View Mode Toggle */}
                  <div className="flex bg-final-gray rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded-md transition-all duration-300 ${
                        viewMode === 'grid'
                          ? 'bg-final-accent text-final-black'
                          : 'text-final-off-white hover:text-final-accent'
                      }`}
                    >
                      <FiGrid className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-md transition-all duration-300 ${
                        viewMode === 'list'
                          ? 'bg-final-accent text-final-black'
                          : 'text-final-off-white hover:text-final-accent'
                      }`}
                    >
                      <FiList className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Products Grid */}
        <section className="px-4 sm:px-6 lg:px-8 pb-20">
          <div className="max-w-7xl mx-auto">
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <div className="w-16 h-16 border-4 border-final-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <h3 className="text-2xl font-semibold text-final-off-white mb-2">Loading products...</h3>
                <p className="text-final-off-white/70">Fetching the latest collection from Supabase.</p>
              </motion.div>
            ) : filteredProducts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <div className="w-16 h-16 bg-final-dark-gray rounded-full flex items-center justify-center mx-auto mb-4">
                  <FiFilter className="w-8 h-8 text-final-accent" />
                </div>
                <h3 className="text-2xl font-semibold text-final-off-white mb-2">No products found</h3>
                <p className="text-final-off-white/70">
                  Try adjusting your filters or check back later for new products.
                </p>
              </motion.div>
            ) : (
              <div className={`grid gap-6 ${
                viewMode === 'grid' 
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
                  : 'grid-cols-1'
              }`}>
                {filteredProducts.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                  >
                    <ProductCard 
                      product={product}
                      viewMode={viewMode}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  )
} 