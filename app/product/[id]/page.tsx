'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { FiShoppingCart, FiHeart, FiShare2, FiZoomIn, FiStar, FiTruck, FiShield, FiRefreshCw } from 'react-icons/fi'
import { useCart } from '@/components/providers/CartProvider'
import { Layout } from '@/components/layout/Layout'

// Mock reviews data
const reviews = [
  {
    id: 1,
    user: 'Alex K.',
    rating: 5,
    date: '2024-01-15',
    comment: 'Absolutely love this hoodie! The quality is amazing and the neon accents are perfect. Fits true to size.',
    verified: true
  },
  {
    id: 2,
    user: 'Sarah M.',
    rating: 4,
    date: '2024-01-10',
    comment: 'Great hoodie, very comfortable. The material feels premium. Only giving 4 stars because it runs slightly large.',
    verified: true
  },
  {
    id: 3,
    user: 'Mike R.',
    rating: 5,
    date: '2024-01-08',
    comment: 'This is my third Final Heaven piece and they never disappoint. The attention to detail is incredible.',
    verified: true
  }
]

export default function ProductPage({ params }: { params: { id: string } }) {
  const [selectedImage, setSelectedImage] = useState(0)
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedColor, setSelectedColor] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [isImageZoomed, setIsImageZoomed] = useState(false)
  const [activeTab, setActiveTab] = useState<'description' | 'reviews' | 'shipping'>('description')
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { addItem } = useCart()

  useEffect(() => {
    async function loadProduct() {
      try {
        setLoading(true)
        const res = await fetch(`/api/products/${params.id}`)
        const data = await res.json()
        setProduct(data.product)
      } catch (error) {
        console.error('Failed to load product:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProduct()
  }, [params.id])

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-final-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-final-off-white text-lg">Loading product details…</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (!product) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-final-off-white mb-4">Product not found</h1>
            <p className="text-final-off-white/70">The product you're looking for doesn't exist.</p>
          </div>
        </div>
      </Layout>
    )
  }

  // Use images array from product, fallback to legacy image
  const images = product.images && product.images.length > 0
    ? product.images.map((img: any) => img.url)
    : product.image
      ? [product.image]
      : []

  // Find the image index for the selected color
  const colorImageIndex = selectedColor && product.images
    ? product.images.findIndex((img: any) => img.color === selectedColor)
    : -1

  const mainImageIndex = colorImageIndex >= 0 ? colorImageIndex : selectedImage
  const mainImage = images[mainImageIndex] || images[0] || ''

  const handleAddToCart = () => {
    if (!selectedSize && product.sizes && product.sizes.length > 0) {
      alert('Please select a size')
      return
    }
    if (!selectedColor && product.colors && product.colors.length > 0) {
      alert('Please select a color')
      return
    }

    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: mainImage || '/api/placeholder/400/500',
      size: selectedSize,
      quantity,
      isMembersOnly: product.membersOnly || false
    })
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <FiStar
        key={i}
        className={`w-4 h-4 ${
          i < Math.floor(rating) 
            ? 'text-yellow-400 fill-current' 
            : i < rating 
              ? 'text-yellow-400 fill-current opacity-50' 
              : 'text-final-off-white/30'
        }`}
      />
    ))
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            {/* Product Images */}
            <div className="space-y-6">
              {/* Main Image */}
              <div className="relative aspect-[3/4] bg-final-dark-gray rounded-xl overflow-hidden border border-final-light-gray/30">
                <Image
                  src={mainImage}
                  alt={product.name}
                  fill
                  className="object-cover cursor-zoom-in"
                  onClick={() => setIsImageZoomed(!isImageZoomed)}
                />
                <div className="absolute top-4 right-4 flex space-x-2">
                  <button className="p-3 bg-final-black/50 backdrop-blur-sm rounded-full text-final-off-white hover:bg-final-accent hover:text-final-black transition-all duration-300">
                    <FiHeart className="w-5 h-5" />
                  </button>
                  <button className="p-3 bg-final-black/50 backdrop-blur-sm rounded-full text-final-off-white hover:bg-final-accent hover:text-final-black transition-all duration-300">
                    <FiShare2 className="w-5 h-5" />
                  </button>
                  <button 
                    className="p-3 bg-final-black/50 backdrop-blur-sm rounded-full text-final-off-white hover:bg-final-accent hover:text-final-black transition-all duration-300"
                    onClick={() => setIsImageZoomed(!isImageZoomed)}
                  >
                    <FiZoomIn className="w-5 h-5" />
                  </button>
                </div>
                {product.membersOnly && (
                  <div className="absolute top-4 left-4">
                    <span className="bg-final-accent text-final-black text-sm font-bold px-3 py-1 rounded-full">
                      MEMBERS ONLY
                    </span>
                  </div>
                )}
                {product.isLimited && (
                  <div className="absolute top-4 left-4">
                    <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      LIMITED
                    </span>
                  </div>
                )}
              </div>

              {/* Thumbnail Images */}
              <div className="flex space-x-4">
                {images.map((image: string, index: number) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`relative aspect-square w-20 bg-final-dark-gray rounded-lg overflow-hidden border-2 transition-all duration-300 ${
                      mainImageIndex === index ? 'border-final-accent scale-105' : 'border-transparent hover:border-final-accent/50'
                    }`}
                  >
                    <Image
                      src={image}
                      alt={`${product.name} ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Product Info */}
            <div className="space-y-8">
              {/* Header */}
              <div>
                <div className="flex items-center space-x-4 mb-4">
                  <div className="flex items-center space-x-2">
                    {renderStars(product.rating || 0)}
                    <span className="text-final-off-white/70">({product.reviews || 0} reviews)</span>
                  </div>
                  <span className="text-final-accent font-semibold">• {product.sales || 0} sold</span>
                </div>

                <h1 className="text-4xl font-bold text-final-off-white mb-4">{product.name}</h1>
                
                <div className="flex items-center space-x-4 mb-6">
                  <div className="flex items-center space-x-2">
                    <span className="text-3xl font-bold text-final-accent">${product.price}</span>
                    {product.originalPrice && product.originalPrice > product.price && (
                      <span className="text-xl text-final-off-white/50 line-through">${product.originalPrice}</span>
                    )}
                  </div>
                  {product.originalPrice && product.originalPrice > product.price && (
                    <span className="bg-red-500 text-white text-sm font-bold px-2 py-1 rounded">
                      {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                    </span>
                  )}
                </div>

                <p className="text-final-off-white/70 text-lg leading-relaxed">
                  {product.description}
                </p>
              </div>

              {/* Size Selection */}
              {product.sizes && product.sizes.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-final-off-white mb-3">Size</h3>
                  <div className="flex flex-wrap gap-3">
                    {product.sizes.map((size: string) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`px-4 py-2 rounded-lg border-2 transition-all duration-300 ${
                          selectedSize === size
                            ? 'border-final-accent bg-final-accent text-final-black'
                            : 'border-final-light-gray/30 text-final-off-white hover:border-final-accent/50'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Color Selection */}
              {product.colors && product.colors.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-final-off-white mb-3">Color</h3>
                  <div className="flex flex-wrap gap-3">
                    {product.colors.map((color: string) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`px-4 py-2 rounded-lg border-2 transition-all duration-300 ${
                          selectedColor === color
                            ? 'border-final-accent bg-final-accent text-final-black'
                            : 'border-final-light-gray/30 text-final-off-white hover:border-final-accent/50'
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div>
                <h3 className="text-lg font-semibold text-final-off-white mb-3">Quantity</h3>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 bg-final-gray border border-final-light-gray/30 rounded-lg text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors"
                  >
                    -
                  </button>
                  <span className="text-xl font-semibold text-final-off-white w-12 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 bg-final-gray border border-final-light-gray/30 rounded-lg text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors"
                  >
                    +
                  </button>
                  <span className="text-final-off-white/70">({product.stock} available)</span>
                </div>
              </div>

              {/* Add to Cart */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddToCart}
                disabled={product.stock === 0}
                className="w-full bg-final-accent text-final-black py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {product.stock === 0 ? 'OUT OF STOCK' : 'ADD TO CART'}
              </motion.button>

              {/* Shipping Info */}
              <div className="flex items-center space-x-4 text-final-off-white/70">
                <div className="flex items-center space-x-2">
                  <FiTruck className="w-5 h-5" />
                  <span>Free shipping on orders over $50</span>
                </div>
                <div className="flex items-center space-x-2">
                  <FiShield className="w-5 h-5" />
                  <span>30-day returns</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-20">
            <div className="flex space-x-1 bg-final-gray rounded-lg p-1 mb-8">
              {[
                { id: 'description', label: 'Description' },
                { id: 'reviews', label: 'Reviews' },
                { id: 'shipping', label: 'Shipping & Returns' }
              ].map((tab: any) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 px-4 py-2 rounded-md transition-all duration-300 ${
                    activeTab === tab.id
                      ? 'bg-final-accent text-final-black'
                      : 'text-final-off-white hover:text-final-accent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30">
              {activeTab === 'description' && (
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-final-off-white">Product Details</h3>
                  <p className="text-final-off-white/70 leading-relaxed">
                    {product.description}
                  </p>
                  {product.tags && product.tags.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-final-off-white mb-3">Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {product.tags.map((tag: string) => (
                          <span key={tag} className="bg-final-gray text-final-off-white px-3 py-1 rounded-full text-sm">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'reviews' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-final-off-white">Customer Reviews</h3>
                    <div className="flex items-center space-x-2">
                      {renderStars(product.rating || 0)}
                      <span className="text-final-off-white/70">({product.reviews || 0} reviews)</span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {reviews.map((review: any) => (
                      <div key={review.id} className="border-b border-final-light-gray/20 pb-6 last:border-b-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-final-off-white">{review.user}</span>
                            {review.verified && (
                              <span className="bg-final-accent text-final-black text-xs px-2 py-1 rounded">Verified</span>
                            )}
                          </div>
                          <span className="text-final-off-white/50 text-sm">{review.date}</span>
                        </div>
                        <div className="flex items-center space-x-2 mb-3">
                          {renderStars(review.rating)}
                        </div>
                        <p className="text-final-off-white/70">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'shipping' && (
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-final-off-white">Shipping & Returns</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="text-lg font-semibold text-final-off-white mb-3">Shipping Information</h4>
                      <ul className="space-y-2 text-final-off-white/70">
                        <li>• Free shipping on orders over $50</li>
                        <li>• Standard shipping: 3-5 business days</li>
                        <li>• Express shipping: 1-2 business days</li>
                        <li>• International shipping available</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-final-off-white mb-3">Return Policy</h4>
                      <ul className="space-y-2 text-final-off-white/70">
                        <li>• 30-day return window</li>
                        <li>• Items must be unworn and unwashed</li>
                        <li>• Free returns for US customers</li>
                        <li>• Refund processed within 5-7 days</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Image Zoom Modal */}
        {isImageZoomed && (
          <div 
            className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
            onClick={() => setIsImageZoomed(false)}
          >
            <div className="relative max-w-4xl max-h-full">
              <Image
                src={mainImage}
                alt={product.name}
                width={800}
                height={1000}
                className="object-contain max-h-[90vh]"
              />
              <button
                onClick={() => setIsImageZoomed(false)}
                className="absolute top-4 right-4 text-white text-3xl hover:text-final-accent transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
} 