'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { FiShoppingCart, FiEye, FiStar, FiClock, FiUsers } from 'react-icons/fi'
import { useCart } from '@/components/providers/CartProvider'
import { useState, useEffect } from 'react'
import { Product } from '@/lib/stores/productStore'

interface ProductCardProps {
  product: Product
  viewMode?: 'grid' | 'list'
}

export function ProductCard({ product, viewMode = 'grid' }: ProductCardProps) {
  const { addItem } = useCart()
  const [showToast, setShowToast] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => { setHasMounted(true) }, [])

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // For demo purposes, using default size and color
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images && product.images.length > 0 ? product.images[0].url : '/api/placeholder/400/500',
      size: 'M', // Default size
      quantity: 1,
      isMembersOnly: product.membersOnly
    })
    setShowToast(true)
    setTimeout(() => setShowToast(false), 1500)
  }

  const mainImage = product.images && product.images.length > 0
    ? product.images[0].url
    : '/api/placeholder/400/500'

  if (viewMode === 'list') {
    return (
      <Link href={`/product/${product.id}`}>
        <motion.div
          whileHover={{ y: -4 }}
          className="group bg-final-dark-gray rounded-lg overflow-hidden card-hover border border-final-light-gray/30"
        >
          {/* Toast Feedback */}
          {hasMounted && showToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-6 py-3 bg-final-accent text-final-black font-bold rounded-full shadow-lg animate-bounce drop-shadow-xl border-2 border-final-black/30">
              Added to cart!
            </div>
          )}
          <div className="flex">
            {/* Image Container */}
            <div className="relative w-48 h-48 flex-shrink-0">
              <Image
                src={mainImage}
                alt={product.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Badges */}
              <div className="absolute top-3 left-3 flex flex-col gap-2">
                {product.isNew && (
                  <span className="bg-final-accent text-final-black text-xs font-bold px-2 py-1 rounded-full">
                    NEW
                  </span>
                )}
                {product.isLimited && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    LIMITED
                  </span>
                )}
                {product.membersOnly && (
                  <span className="bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    MEMBERS ONLY
                  </span>
                )}
              </div>

              {/* Quick Actions */}
              <div className="absolute top-3 right-3 flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-8 h-8 bg-final-accent text-final-black rounded-full flex items-center justify-center hover:shadow-lg"
                >
                  <FiEye className="w-4 h-4" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleAddToCart}
                  className="w-8 h-8 bg-final-accent text-final-black rounded-full flex items-center justify-center hover:shadow-lg"
                >
                  <FiShoppingCart className="w-4 h-4" />
                </motion.button>
              </div>
            </div>

            {/* Product Info */}
            <div className="flex-1 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-final-off-white mb-2 group-hover:text-final-accent transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-final-off-white/70 text-sm mb-3 line-clamp-2">
                    {product.description}
                  </p>
                  
                  {/* Rating and Reviews */}
                  {product.rating && (
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="flex items-center space-x-1">
                        <FiStar className="w-4 h-4 text-yellow-400 fill-current" />
                        <span className="text-final-off-white text-sm">{product.rating}</span>
                      </div>
                      <span className="text-final-off-white/50 text-sm">({product.reviews} reviews)</span>
                    </div>
                  )}

                  {/* Release Date */}
                  {product.releaseDate && (
                    <div className="flex items-center space-x-2 mb-3">
                      <FiClock className="w-4 h-4 text-final-accent" />
                      <span className="text-final-off-white/70 text-sm">
                        Released {new Date(product.releaseDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="mb-2">
                    {product.originalPrice && (
                      <span className="text-final-off-white/50 line-through text-sm mr-2">
                        ${product.originalPrice}
                      </span>
                    )}
                    <span className="text-2xl font-bold text-final-accent">
                      ${product.price}
                    </span>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddToCart}
                    className="bg-final-accent text-final-black px-6 py-2 rounded-lg font-semibold text-sm hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                  >
                    ADD TO CART
                  </motion.button>
                </div>
              </div>

              {/* Additional Info */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-4">
                  <span className="text-final-off-white/70">Category: {product.category}</span>
                  {product.colors && (
                    <span className="text-final-off-white/70">
                      Colors: {product.colors.length}
                    </span>
                  )}
                  {product.sizes && (
                    <span className="text-final-off-white/70">
                      Sizes: {product.sizes.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    )
  }

  // Grid view (original design)
  return (
    <Link href={`/product/${product.id}`}>
      <motion.div
        whileHover={{ y: -8 }}
        className="group relative bg-final-dark-gray rounded-lg overflow-hidden card-hover"
      >
        {/* Toast Feedback */}
        {hasMounted && showToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-6 py-3 bg-final-accent text-final-black font-bold rounded-full shadow-lg animate-bounce drop-shadow-xl border-2 border-final-black/30">
            Added to cart!
          </div>
        )}
        {/* Image Container */}
        <div className="relative aspect-[3/4] overflow-hidden">
          <Image
            src={mainImage}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-110 transition-transform duration-500"
          />
          
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* Quick Actions */}
          <div className="absolute top-4 right-4 flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-10 h-10 bg-final-accent text-final-black rounded-full flex items-center justify-center hover:shadow-lg"
            >
              <FiEye className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleAddToCart}
              className="w-10 h-10 bg-final-accent text-final-black rounded-full flex items-center justify-center hover:shadow-lg"
            >
              <FiShoppingCart className="w-5 h-5" />
            </motion.button>
          </div>

          {/* Badges */}
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            {product.isNew && (
              <span className="bg-final-accent text-final-black text-xs font-bold px-2 py-1 rounded-full">
                NEW
              </span>
            )}
            {product.isLimited && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                LIMITED
              </span>
            )}
            {product.membersOnly && (
              <span className="bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                MEMBERS ONLY
              </span>
            )}
          </div>

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div className="absolute top-4 left-4 flex flex-wrap gap-1">
              {product.tags.map(tag => (
                <span key={tag} className="bg-final-black/80 text-final-off-white text-xs font-medium px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Category Badge */}
          <div className="absolute bottom-4 left-4">
            <span className="bg-final-black/80 text-final-off-white text-xs font-medium px-2 py-1 rounded">
              {product.category}
            </span>
          </div>
        </div>

        {/* Product Info */}
        <div className="p-4">
          <h3 className="text-lg font-semibold text-final-off-white mb-2 group-hover:text-final-accent transition-colors">
            {product.name}
          </h3>
          
          <div className="flex items-center justify-between">
            <div>
              {product.originalPrice && (
                <span className="text-final-off-white/50 line-through text-sm mr-2">
                  ${product.originalPrice}
                </span>
              )}
              <span className="text-xl font-bold text-final-accent">
                ${product.price}
              </span>
            </div>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAddToCart}
              className="bg-final-accent text-final-black px-4 py-2 rounded-lg font-semibold text-sm hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
            >
              ADD TO CART
            </motion.button>
          </div>
        </div>
      </motion.div>
    </Link>
  )
} 