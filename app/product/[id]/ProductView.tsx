'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { FiTruck, FiShield } from 'react-icons/fi'
import { ProductGallery, type GalleryImage } from '@/components/product/ProductGallery'
import { formatCurrency } from '@/lib/utils/format'
import { useCart } from '@/components/providers/CartProvider'
import { Layout } from '@/components/layout/Layout'
import { RecommendedProducts } from '@/components/sections/RecommendedProducts'
import { useInterestStore } from '@/lib/stores/interestStore'
import { track } from '@/lib/analytics'
import { PolicySummary } from '@/components/legal/PolicySummary'
import { POLICY } from '@/lib/legal'
import { formatDay, stringList, type Product } from '@/lib/catalog'
import { sourceLabel, supplyLabel } from '@/lib/collections'
import { setGroups } from '@/lib/sets'


/** Who makes it (originals and labels), and, when it's made to order, that it ships only once made. */
function Provenance({ product }: { product: Product }) {
  const source = sourceLabel(product)
  const supply = supplyLabel(product)
  if (!source && !supply) return null
  return (
    <dl className="mt-6 grid gap-x-6 gap-y-3 border-t border-final-light-gray/30 pt-5 text-sm sm:grid-cols-[auto_1fr]">
      {source && (
        <>
          <dt className="text-final-muted">From</dt>
          <dd className="text-final-off-white">
            {product.sourceType === 'independent' && product.brand
              ? <Link href={`/brands/${product.brand.slug}`} className="underline underline-offset-2">{product.brand.name}</Link>
              : source}
          </dd>
        </>
      )}
      {supply && (
        <>
          <dt className="text-final-muted">Supply</dt>
          <dd className="text-final-off-white">
            {supply}
            <p className="mt-1 text-final-off-white/70">
              We make this after you order{product.leadTimeDays ? `, so it ships about ${product.leadTimeDays} days after payment` : ''}. It doesn’t ship straight away.
            </p>
          </dd>
        </>
      )}
    </dl>
  )
}

export function ProductView({ params }: { params: { id: string } }) {
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedColor, setSelectedColor] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'description' | 'shipping'>('description')
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [allProducts, setAllProducts] = useState<any[]>([])
  const timeStartRef = useRef<number>(Date.now())

  // Escape closes the full-size photo.
  useEffect(() => {
    if (zoomIndex === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoomIndex(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomIndex])
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

  const isSet = !!setGroups(stringList(product.colors))

  // Every photo, each with its colour when it shows one (legacy products have a single `image`).
  const galleryImages: GalleryImage[] = product.images && product.images.length > 0
    ? product.images.filter((img: any) => img?.url).map((img: any) => ({ url: img.url, color: img.color || undefined }))
    : product.image ? [{ url: product.image }] : []
  // The cart shows the chosen colour's photo when there is one.
  const mainImage = (selectedColor && galleryImages.find((img) => img.color === selectedColor)?.url) || galleryImages[0]?.url || ''

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
    paused: 'NOT AVAILABLE RIGHT NOW',
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
      <div className="min-h-screen bg-final-black pt-20 md:pt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 pt-2 md:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
            {/* Product Images: swipe between photos; colour photos follow the colour picker. */}
            <ProductGallery
              images={galleryImages}
              name={product.name}
              color={selectedColor}
              onColor={(c) => { if (stringList(product.colors).includes(c)) setSelectedColor(c) }}
              onZoom={setZoomIndex}
              badges={(product.membersOnly || product.isLimited) && (
                <div className="pointer-events-none absolute left-3 top-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold text-final-black ${product.membersOnly ? 'bg-final-accent' : 'bg-final-ember'}`}>
                    {product.membersOnly ? 'MEMBERS ONLY' : 'LIMITED'}
                  </span>
                </div>
              )}
            />

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
                <Provenance product={product} />
              </div>

              {/* A set is put together on its own page (picks from each group), not chosen here. */}
              {isSet ? (
                <Link href="/drop-01#set" className="block w-full rounded-lg bg-final-accent py-4 text-center text-lg font-bold text-final-black transition-all duration-300 hover:shadow-lg hover:shadow-final-accent/25">
                  BUILD YOUR SET
                </Link>
              ) : (<>
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
              </>)}
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

        {/* Full size: the photo that was tapped. */}
        {zoomIndex !== null && galleryImages[zoomIndex] && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${product.name}, full size`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
            onClick={() => setZoomIndex(null)}
          >
            <div className="relative max-h-full max-w-4xl">
              <Image
                src={galleryImages[zoomIndex].url}
                alt={product.name}
                width={1200}
                height={1500}
                unoptimized
                className="max-h-[90vh] w-auto object-contain"
              />
              <button
                type="button"
                autoFocus
                aria-label="Close"
                onClick={() => setZoomIndex(null)}
                className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-2xl text-white active:scale-90"
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