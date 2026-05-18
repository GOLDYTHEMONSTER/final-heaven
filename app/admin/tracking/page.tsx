'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { FiTrash2, FiDownload, FiRefreshCw, FiEye, FiShoppingCart, FiSearch, FiTrendingUp, FiActivity, FiPackage } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { useInterestStore } from '@/lib/stores/interestStore'

interface TrackingStats {
  totalViews: number
  totalSearches: number
  totalCartAdditions: number
  totalFavoriteCategories: number
  averageTimePerView: number
  mostViewedCategory: string
  topSearchTerm: string
}

export default function TrackingPage() {
  const [stats, setStats] = useState<TrackingStats | null>(null)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const { interests, clearInterests, getMostViewedCategories } = useInterestStore()

  useEffect(() => {
    // Calculate statistics
    const totalViews = interests.viewedProducts.length
    const totalSearches = interests.searchHistory.length
    const totalCartAdditions = interests.cartAdditions.length
    const totalFavoriteCategories = interests.favoritedCategories.length

    const averageTimePerView =
      totalViews > 0
        ? interests.viewedProducts.reduce((sum, p) => sum + p.timeSpent, 0) / totalViews
        : 0

    const mostViewedCategories = getMostViewedCategories()
    const mostViewedCategory =
      mostViewedCategories.length > 0 ? mostViewedCategories[0].category : 'None'

    const topSearchTerm =
      interests.searchHistory.length > 0 ? interests.searchHistory[0] : 'None'

    setStats({
      totalViews,
      totalSearches,
      totalCartAdditions,
      totalFavoriteCategories,
      averageTimePerView,
      mostViewedCategory,
      topSearchTerm
    })
  }, [interests, getMostViewedCategories])

  const handleExportData = () => {
    const dataToExport = {
      exportDate: new Date().toISOString(),
      interests,
      stats
    }

    const dataStr = JSON.stringify(dataToExport, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `user-tracking-data-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleClearData = () => {
    clearInterests()
    setShowConfirmClear(false)
    setStats({
      totalViews: 0,
      totalSearches: 0,
      totalCartAdditions: 0,
      totalFavoriteCategories: 0,
      averageTimePerView: 0,
      mostViewedCategory: 'None',
      topSearchTerm: 'None'
    })
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  if (!stats) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center pt-24">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-final-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-final-off-white text-lg">Loading tracking data…</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
        {/* Admin Navigation */}
        <div className="border-b border-final-light-gray/20 bg-final-black/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-8 py-4">
              <Link
                href="/admin"
                className="flex items-center gap-2 text-final-off-white/60 hover:text-final-off-white font-semibold border-b-2 border-transparent pb-4 transition-colors"
              >
                <FiPackage className="w-5 h-5" />
                Products
              </Link>
              <Link
                href="/admin/tracking"
                className="flex items-center gap-2 text-final-off-white font-semibold border-b-2 border-final-accent pb-4"
              >
                <FiActivity className="w-5 h-5" />
                User Tracking
              </Link>
            </div>
          </div>
        </div>

        {/* Header */}
        <section className="py-12 px-4 sm:px-6 lg:px-8 border-b border-final-light-gray/20">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <FiActivity className="w-8 h-8 text-final-accent" />
                <h1 className="text-4xl font-bold text-final-off-white">User Tracking Dashboard</h1>
              </div>
              <p className="text-final-off-white/60">Monitor and manage user interest data and browsing analytics</p>
            </motion.div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
            >
              {/* Total Views */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-xl p-6 hover:border-final-accent/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-final-off-white/70 text-sm font-semibold">Total Product Views</h3>
                  <FiEye className="w-5 h-5 text-final-accent" />
                </div>
                <p className="text-4xl font-bold text-final-accent">{stats.totalViews}</p>
                <p className="text-final-off-white/50 text-sm mt-2">Unique product page visits</p>
              </div>

              {/* Total Searches */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-xl p-6 hover:border-final-accent/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-final-off-white/70 text-sm font-semibold">Total Searches</h3>
                  <FiSearch className="w-5 h-5 text-final-accent" />
                </div>
                <p className="text-4xl font-bold text-final-accent">{stats.totalSearches}</p>
                <p className="text-final-off-white/50 text-sm mt-2">Product searches performed</p>
              </div>

              {/* Cart Additions */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-xl p-6 hover:border-final-accent/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-final-off-white/70 text-sm font-semibold">Cart Additions</h3>
                  <FiShoppingCart className="w-5 h-5 text-final-accent" />
                </div>
                <p className="text-4xl font-bold text-final-accent">{stats.totalCartAdditions}</p>
                <p className="text-final-off-white/50 text-sm mt-2">Items added to cart</p>
              </div>

              {/* Avg Time Spent */}
              <div className="bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-xl p-6 hover:border-final-accent/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-final-off-white/70 text-sm font-semibold">Avg. Time Per View</h3>
                  <FiTrendingUp className="w-5 h-5 text-final-accent" />
                </div>
                <p className="text-4xl font-bold text-final-accent">{formatTime(stats.averageTimePerView)}</p>
                <p className="text-final-off-white/50 text-sm mt-2">Average time on product page</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Detailed Data Sections */}
        <section className="px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Top Insights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-xl p-8"
            >
              <h2 className="text-2xl font-bold text-final-off-white mb-6">Top Insights</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-final-off-white/60 text-sm mb-2">Most Viewed Category</p>
                  <p className="text-2xl font-bold text-final-accent">{stats.mostViewedCategory}</p>
                </div>
                <div>
                  <p className="text-final-off-white/60 text-sm mb-2">Top Search Term</p>
                  <p className="text-2xl font-bold text-final-accent">{stats.topSearchTerm}</p>
                </div>
              </div>
            </motion.div>

            {/* Viewed Products */}
            {interests.viewedProducts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-xl p-8"
              >
                <h2 className="text-2xl font-bold text-final-off-white mb-6">Recently Viewed Products</h2>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {interests.viewedProducts
                    .slice()
                    .reverse()
                    .slice(0, 10)
                    .map((product, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-final-gray/30 rounded-lg border border-final-light-gray/10 hover:border-final-accent/30 transition-all"
                      >
                        <div className="flex-1">
                          <p className="text-final-off-white font-semibold">{product.productId}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-final-off-white/60">
                            <span>{product.category}</span>
                            <span>•</span>
                            <span>{formatTime(product.timeSpent)}</span>
                            <span>•</span>
                            <span>{new Date(product.viewedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-block bg-final-accent/20 text-final-accent px-3 py-1 rounded-full text-sm">
                            {product.tags.length} tags
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </motion.div>
            )}

            {/* Search History */}
            {interests.searchHistory.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-xl p-8"
              >
                <h2 className="text-2xl font-bold text-final-off-white mb-6">Search History</h2>
                <div className="flex flex-wrap gap-2">
                  {interests.searchHistory.map((search, index) => (
                    <span
                      key={index}
                      className="bg-final-accent/20 text-final-accent px-4 py-2 rounded-full text-sm hover:bg-final-accent/30 transition-colors cursor-pointer"
                    >
                      {search}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Favorite Categories */}
            {interests.favoritedCategories.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-xl p-8"
              >
                <h2 className="text-2xl font-bold text-final-off-white mb-6">Favorite Categories</h2>
                <div className="flex flex-wrap gap-3">
                  {interests.favoritedCategories.map((category, index) => (
                    <span
                      key={index}
                      className="bg-final-accent/20 text-final-accent px-4 py-2 rounded-lg border border-final-accent/30 text-sm"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Empty State */}
            {stats.totalViews === 0 && stats.totalSearches === 0 && stats.totalCartAdditions === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="text-center py-12"
              >
                <div className="w-16 h-16 bg-final-dark-gray rounded-full flex items-center justify-center mx-auto mb-4">
                  <FiEye className="w-8 h-8 text-final-accent/50" />
                </div>
                <p className="text-final-off-white/70">No user tracking data yet. User activity will appear here.</p>
              </motion.div>
            )}
          </div>
        </section>

        {/* Actions */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 border-t border-final-light-gray/20">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <button
                onClick={handleExportData}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-final-accent text-final-black font-semibold rounded-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
              >
                <FiDownload className="w-5 h-5" />
                Export Data
              </button>

              <button
                onClick={() => setShowConfirmClear(true)}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500/20 text-red-500 border border-red-500/30 font-semibold rounded-lg hover:bg-red-500/30 transition-all duration-300"
              >
                <FiTrash2 className="w-5 h-5" />
                Clear All Data
              </button>

              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-final-gray border border-final-light-gray/30 text-final-off-white font-semibold rounded-lg hover:border-final-accent/50 transition-all duration-300"
              >
                <FiRefreshCw className="w-5 h-5" />
                Refresh
              </button>
            </motion.div>
          </div>
        </section>
      </div>

      {/* Clear Confirmation Modal */}
      {showConfirmClear && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-final-dark-gray border border-final-light-gray/30 rounded-xl p-8 max-w-sm w-full"
          >
            <h2 className="text-2xl font-bold text-final-off-white mb-4">Clear All Data?</h2>
            <p className="text-final-off-white/70 mb-8">
              This will permanently delete all tracked user data including viewed products, searches, and cart additions.
              This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 px-4 py-2 bg-final-gray border border-final-light-gray/30 text-final-off-white font-semibold rounded-lg hover:border-final-accent/50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                className="flex-1 px-4 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-all"
              >
                Clear Data
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </Layout>
  )
}
