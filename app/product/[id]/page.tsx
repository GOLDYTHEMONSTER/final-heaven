'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { FiHeart, FiShare2, FiZoomIn, FiTruck, FiShield } from 'react-icons/fi'
import { formatCurrency } from '@/lib/utils/format'
import { useCart } from '@/components/providers/CartProvider'
import { Layout } from '@/components/layout/Layout'
import { RecommendedProducts } from '@/components/sections/RecommendedProducts'
import { useInterestStore } from '@/lib/stores/interestStore'
import { track } from '@/lib/analytics'
import { PolicySummary } from '@/components/legal/PolicySummary'
import { POLICY } from '@/lib/legal'
import { formatDay } from '@/lib/catalog'


export default function ProductPage({ params }: { params: { id: string } }) {
  const [selectedImage, setSelectedImage] = useState(0)
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedColor, setSelectedColor] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [isImageZoomed, setIsImageZoomed] = useState(false)
  const [activeTab, setActiveTab] = useState<'description' | 'shipping'>('description')
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [allProducts, setAllProducts] = useState<any[]>([])
  const timeStartRef = useRef<number>(Date.now())
  const { addItem } = useCart()
  const { trackProductView, updateTimeSpent, addFavoriteCategory, trackCartAddition } = useInterestStore()

  useEffect(() => {
    async function loadProduct() {
      try {
        setLoading(true)
        const res = await fetch(`/api/products/${params.id}`)
        const data = await res.json()
        setProduct(data.product)
        if (data.product?.id) track('product_view', { productId: data.product.id })
        
        // Load all products for recommendations
        const allRes = await fetch('/api/products')
        const allData = await allRes.json()
        setAllProducts(allData.products || [])
      } catch (error) {
        console.error('Failed to load product:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProduct()
  }, [params.id])

  // Track product view and time spent
  useEffect(() => {
    if (!product) return

    // Track product view
    trackProductView(
      product.id,
      product.category,
      product.tags || []
    )
    addFavoriteCategory(product.category)

    // Reset time start when product changes
    timeStartRef.current = Date.now()

    // Update time spent on page
    const interval = setInterval(() => {
      const timeSpent = Date.now() - timeStartRef.current
      updateTimeSpent(product.id, timeSpent)
    }, 5000) // Update every 5 seconds

    return () => {
      clearInterval(interval)
      // Final update on cleanup
      const finalTimeSpent = Date.now() - timeStartRef.current
      updateTimeSpent(product.id, finalTimeSpent)
    }
  }, [product, trackProductView, updateTimeSpent, addFavoriteCategory])

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
            <p className="text-final-off-white/70">The product you&apos;re looking for doesn&apos;t exist.</p>
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

  // From the server, by the same rules checkout enforces.
  const purchase = product.purchase ?? { state: 'unavailable' }
  const buyable = purchase.state === 'available' || purchase.state === 'preorder'
  const maxQuantity = Math.min(20, purchase.maxQuantity ?? 0)
  const shipsOn = purchase.state === 'preorder'
    ? formatDay(purchase.shipsOn) : null
  const buttonLabel = {
    available: 'ADD TO CART',
    preorder: `PRE-ORDER · SHIPS ${shipsOn?.toUpperCase()}`,
    sold_out: 'SOLD OUT',
    coming_soon: purchase.releaseDate
      ? `COMING ${formatDay(purchase.releaseDate, { day: 'numeric', month: 'long' }).toUpperCase()}` : 'COMING SOON',
    members_only: 'MEMBERS ONLY',
    unavailable: 'UNAVAILABLE',
  }[purchase.state as string] ?? 'UNAVAILABLE'

  const handleAddToCart = () => {
    if (!buyable) return
    if (!selectedSize && product.sizes && product.sizes.length > 0) {
      alert('Please select a size')
      return
    }
    if (!selectedColor && product.colors && product.colors.length > 0) {
      alert('Please select a color')
      return
    }

    trackCartAddition(product.id)
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: mainImage || '/api/placeholder/400/500',
      size: product.sizes?.length ? selectedSize : null,
      color: product.colors?.length ? selectedColor : null,
      quantity: Math.min(quantity, maxQuantity || 1),
      isMembersOnly: product.membersOnly || false
    })
  }

  return (
    <Layout>
      <div className="min-h-screen bg-final-black pt-24">
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
                {product.isLimited && !product.membersOnly && (
                  <div className="absolute top-4 left-4">
                    <span className="bg-final-ember text-final-black text-sm font-bold px-3 py-1 rounded-full">
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
                <h1 className="text-4xl font-bold text-final-off-white mb-4">{product.name}</h1>
                
                <div className="flex items-center space-x-4 mb-6">
                  <div className="flex items-center space-x-2">
                    <span className="text-3xl font-bold text-final-accent">{formatCurrency(product.price)}</span>
                    {product.originalPrice && product.originalPrice > product.price && (
                      <span className="text-xl text-final-off-white/50 line-through">{formatCurrency(product.originalPrice)}</span>
                    )}
                  </div>
                  {product.originalPrice && product.originalPrice > product.price && (
                    <span className="bg-final-ember text-final-black text-sm font-bold px-2 py-1 rounded">
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
                  <h3 className="text-lg font-semibold text-final-off-white mb-3">{product.tags?.includes('set') ? 'Your picks' : 'Color'}</h3>
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
                    onClick={() => setQuantity(Math.min(quantity + 1, Math.max(1, maxQuantity)))}
                    disabled={!buyable || quantity >= maxQuantity}
                    className="w-10 h-10 bg-final-gray border border-final-light-gray/30 rounded-lg text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors"
                  >
                    +
                  </button>
                  {buyable && (
                    <span className="text-final-off-white/70">
                      {purchase.state === 'preorder' ? `(${maxQuantity} left to pre-order)` : maxQuantity <= 5 ? `(only ${maxQuantity} left)` : '(in stock)'}
                    </span>
                  )}
                </div>
              </div>

              {/* Add to Cart */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddToCart}
                disabled={!buyable}
                className="w-full bg-final-accent text-final-black py-4 rounded-lg font-bold text-lg hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {buttonLabel}
              </motion.button>
              {purchase.state === 'preorder' && (
                <p className="text-sm text-final-muted">Pay now to reserve yours. It ships from {shipsOn}; we&apos;ll email you when it does.</p>
              )}
              {purchase.state === 'members_only' && (
                <p className="text-sm text-final-muted">This piece is reserved for Final Heaven members. <a href="/membership" className="underline underline-offset-2">Join the waitlist</a> to hear when membership opens.</p>
              )}

              {/* Shipping Info */}
              <div className="flex items-center space-x-4 text-final-off-white/70">
                <div className="flex items-center space-x-2">
                  <FiTruck className="w-5 h-5" />
                  <span>Delivery within {POLICY.shipsTo}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <FiShield className="w-5 h-5" />
                  <span>{POLICY.returnWindowDays}-day returns</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-20">
            <div className="flex space-x-1 bg-final-gray rounded-lg p-1 mb-8">
              {[
                { id: 'description', label: 'Description' },
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

              {activeTab === 'shipping' && (
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-final-off-white">Shipping & Returns</h3>
                  <PolicySummary />
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

        {/* Recommended Products Section */}
        {allProducts.length > 0 && (
          <RecommendedProducts
            currentProductId={product?.id}
            allProducts={allProducts}
            title="Also Check Out"
            subtitle="Curated picks based on your current selection"
            limit={4}
            variant="compact"
          />
        )}
      </div>
    </Layout>
  )
} 