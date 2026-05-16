'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  FiPackage, FiPlus, FiEdit, FiTrash2, FiEye, FiCheck, FiX, 
  FiBarChart, FiShoppingBag, FiTrendingUp, FiAlertCircle
} from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { ProductCard } from '@/components/ui/ProductCard'

const categories = ['All', 'Hoodies', 'T-Shirts', 'Pants', 'Jackets', 'Sweaters', 'Accessories', 'Footwear']
const statuses = ['All', 'Active', 'Draft', 'Archived']

export default function AdminPage() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)

  // Fetch products from API on mount
  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/products')
      const data = await res.json()
      setProducts(data.products || [])
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveProduct(product: any) {
    try {
      const isNew = !product.id
      const method = isNew ? 'POST' : 'PUT'
      const newId = `p${Date.now()}`
      const body = isNew
        ? { ...product, id: newId }
        : product

      const res = await fetch('/api/admin/products', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null)
        throw new Error(errorBody?.error || 'Failed to save product')
      }

      const data = await res.json()
      if (isNew) {
        setProducts([data.product, ...products])
      } else {
        setProducts(products.map(p => p.id === product.id ? data.product : p))
      }
      setShowAddProduct(false)
      setEditingProduct(null)
      return true
    } catch (error) {
      console.error('Failed to save product:', error)
      alert('Failed to save product')
      return false
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      const res = await fetch(`/api/admin/products?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete product')

      setProducts(products.filter(p => p.id !== id))
    } catch (error) {
      console.error('Failed to delete product:', error)
      alert('Failed to delete product')
    }
  }

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
    const matchesStatus = selectedStatus === 'All' || product.status === selectedStatus.toLowerCase()
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesStatus && matchesSearch
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-400/20'
      case 'draft': return 'text-yellow-400 bg-yellow-400/20'
      case 'archived': return 'text-gray-400 bg-gray-400/20'
      default: return 'text-gray-400 bg-gray-400/20'
    }
  }

  const getStockColor = (stock: number) => {
    if (stock <= 5) return 'text-red-400'
    if (stock <= 20) return 'text-yellow-400'
    return 'text-green-400'
  }

  function ProductEditorModal({ product, onClose, onSave, isNew = false }: { product: any, onClose: () => void, onSave: (p: any) => Promise<boolean>, isNew?: boolean }) {
    const [form, setForm] = useState<any>(product ? { ...product, images: product.images || [] } : {
      id: '',
      name: '',
      price: 0,
      images: [],
      category: 'T-Shirts',
      description: '',
      stock: 0,
      status: 'active',
      colors: [],
      sizes: [],
      tags: []
    })
    const [dragActive, setDragActive] = useState(false)
    const [colorInput, setColorInput] = useState('')
    const [tagInput, setTagInput] = useState('')

    function handleChange(e: any) {
      const { name, value, type, checked } = e.target
      setForm((f: any) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
    }

    function handleChipAdd(name: 'colors' | 'tags', value: string) {
      const trimmed = value.trim()
      if (!trimmed) return
      setForm((f: any) => ({ ...f, [name]: [...(f[name] || []), trimmed] }))
      if (name === 'colors') setColorInput('')
      if (name === 'tags') setTagInput('')
    }

    function handleChipRemove(name: 'colors' | 'tags', index: number) {
      setForm((f: any) => ({ ...f, [name]: (f[name] || []).filter((_: string, i: number) => i !== index) }))
    }

    function handleArrayChange(name: string, value: string) {
      setForm((f: any) => ({ ...f, [name]: value.split(',').map((v: string) => v.trim()).filter(v => v) }))
    }

    function handleImageFiles(files: FileList | null) {
      if (!files) return
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = (ev) => {
            setForm((f: any) => ({ ...f, images: [...(f.images || []), { url: ev.target?.result as string }] }))
          }
          reader.readAsDataURL(file)
        }
      })
    }

    function handleImageDrop(e: React.DragEvent<HTMLDivElement>) {
      e.preventDefault(); e.stopPropagation(); setDragActive(false)
      handleImageFiles(e.dataTransfer.files)
    }

    function handleImageInput(e: React.ChangeEvent<HTMLInputElement>) {
      handleImageFiles(e.target.files)
    }

    function handleImageUrlAdd(url: string) {
      if (url) setForm((f: any) => ({ ...f, images: [...(f.images || []), { url }] }))
    }

    function handleImageRemove(idx: number) {
      setForm((f: any) => ({ ...f, images: f.images.filter((_: any, i: number) => i !== idx) }))
    }

    function handleImageColor(idx: number, color: string) {
      setForm((f: any) => ({ ...f, images: f.images.map((img: any, i: number) => i === idx ? { ...img, color } : img) }))
    }

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      const success = await onSave(form)
      if (success) {
        onClose()
      }
    }

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-final-dark-gray rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8 relative" onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-final-gray rounded-full flex items-center justify-center text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors">
            <FiX className="w-4 h-4" />
          </button>
          <h2 className="text-2xl font-bold text-final-off-white mb-6">
            {isNew ? 'Create New Product' : 'Edit Product'}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-final-off-white/70 text-sm mb-1">Name *</label>
                <input 
                  name="name" 
                  value={form.name} 
                  onChange={handleChange} 
                  required
                  className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                />
              </div>
              <div>
                <label className="block text-final-off-white/70 text-sm mb-1">Description</label>
                <textarea 
                  name="description" 
                  value={form.description} 
                  onChange={handleChange} 
                  rows={3}
                  className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-final-off-white/70 text-sm mb-1">Price *</label>
                  <input 
                    name="price" 
                    type="number" 
                    step="0.01"
                    value={form.price} 
                    onChange={handleChange} 
                    required
                    className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-final-off-white/70 text-sm mb-1">Original Price</label>
                  <input 
                    name="original_price" 
                    type="number" 
                    step="0.01"
                    value={form.original_price || ''} 
                    onChange={handleChange} 
                    className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-final-off-white/70 text-sm mb-1">Stock *</label>
                  <input 
                    name="stock" 
                    type="number" 
                    value={form.stock} 
                    onChange={handleChange} 
                    required
                    className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-final-off-white/70 text-sm mb-1">Category *</label>
                  <select 
                    name="category" 
                    value={form.category} 
                    onChange={handleChange}
                    required
                    className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent"
                  >
                    {categories.slice(1).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-final-off-white/70 text-sm mb-1">Product Images</label>
                <div
                  onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={e => { e.preventDefault(); setDragActive(false) }}
                  onDrop={handleImageDrop}
                  className={`relative w-full border-2 border-dashed ${dragActive ? 'border-final-accent' : 'border-final-accent/50'} rounded-lg p-4 mb-2 flex flex-col items-center justify-center cursor-pointer bg-final-gray/40`}
                  style={{ minHeight: 120 }}
                >
                  <span className="text-final-off-white/60 text-sm mb-2">Drag & drop images here, or click to select</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageInput}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="Upload product images"
                  />
                  <div className="flex flex-wrap gap-4 mt-2 w-full justify-center">
                    {form.images && form.images.map((img: any, idx: number) => (
                      <div key={idx} className="relative group">
                        <img src={img.url} alt={`Product image ${idx + 1}`} className="w-24 h-24 object-cover rounded border border-final-light-gray/30" />
                        <button type="button" onClick={() => handleImageRemove(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-80 group-hover:opacity-100"><FiX className="w-4 h-4" /></button>
                        {form.colors && form.colors.length > 0 && (
                          <select value={img.color || ''} onChange={e => handleImageColor(idx, e.target.value)} className="mt-1 block w-full bg-final-gray border border-final-light-gray/30 rounded px-2 py-1 text-xs text-final-off-white focus:outline-none focus:border-final-accent">
                            <option value="">No color</option>
                            {form.colors.map((color: string) => (
                              <option key={color} value={color}>{color}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <input type="text" placeholder="Paste image URL" className="flex-1 bg-final-gray border border-final-light-gray/30 rounded-lg px-2 py-1 text-final-off-white focus:outline-none focus:border-final-accent text-sm" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleImageUrlAdd((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' }}} />
                  <button type="button" className="bg-final-accent text-final-black px-3 py-1 rounded-lg font-semibold text-sm" onClick={e => { const input = (e.currentTarget.previousSibling as HTMLInputElement); handleImageUrlAdd(input.value); input.value = '' }}>Add</button>
                </div>
              </div>
              <div>
                <label className="block text-final-off-white/70 text-sm mb-1">Sizes (comma separated)</label>
                <input 
                  name="sizes" 
                  value={form.sizes?.join(', ') || ''} 
                  onChange={e => handleArrayChange('sizes', e.target.value)} 
                  placeholder="S, M, L, XL"
                  className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-final-off-white/70 text-sm mb-1">Colors</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(form.colors || []).map((color: string, idx: number) => (
                    <button
                      key={`${color}-${idx}`}
                      type="button"
                      onClick={() => handleChipRemove('colors', idx)}
                      className="inline-flex items-center gap-2 rounded-full bg-final-gray/70 px-3 py-1 text-sm text-final-off-white border border-final-light-gray/30"
                    >
                      {color}
                      <FiX className="w-3 h-3" />
                    </button>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={colorInput}
                    onChange={(e) => setColorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleChipAdd('colors', colorInput)
                      }
                    }}
                    placeholder="Add a color"
                    className="flex-1 bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent"
                  />
                  <button
                    type="button"
                    onClick={() => handleChipAdd('colors', colorInput)}
                    className="bg-final-accent text-final-black px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                  >
                    Add Color
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-final-off-white/70 text-sm mb-1">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(form.tags || []).map((tag: string, idx: number) => (
                    <button
                      key={`${tag}-${idx}`}
                      type="button"
                      onClick={() => handleChipRemove('tags', idx)}
                      className="inline-flex items-center gap-2 rounded-full bg-final-gray/70 px-3 py-1 text-sm text-final-off-white border border-final-light-gray/30"
                    >
                      {tag}
                      <FiX className="w-3 h-3" />
                    </button>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleChipAdd('tags', tagInput)
                      }
                    }}
                    placeholder="Add a tag"
                    className="flex-1 bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent"
                  />
                  <button
                    type="button"
                    onClick={() => handleChipAdd('tags', tagInput)}
                    className="bg-final-accent text-final-black px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                  >
                    Add Tag
                  </button>
                </div>
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="checkbox" name="is_new" checked={form.is_new} onChange={handleChange} /> New
                </label>
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="checkbox" name="is_limited" checked={form.is_limited} onChange={handleChange} /> Limited
                </label>
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="checkbox" name="is_trending" checked={form.is_trending} onChange={handleChange} /> Trending
                </label>
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="checkbox" name="members_only" checked={form.members_only} onChange={handleChange} /> Members Only
                </label>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="radio" name="status" value="active" checked={form.status === 'active'} onChange={handleChange} /> Active
                </label>
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="radio" name="status" value="draft" checked={form.status === 'draft'} onChange={handleChange} /> Draft
                </label>
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="radio" name="status" value="archived" checked={form.status === 'archived'} onChange={handleChange} /> Archived
                </label>
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={onClose}
                  className="px-6 py-2 bg-final-gray text-final-off-white rounded-lg font-semibold hover:bg-final-accent hover:text-final-black transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-final-accent text-final-black px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                >
                  {isNew ? 'Create Product' : 'Save Changes'}
                </button>
              </div>
            </form>
            <div>
              <h3 className="text-lg font-semibold text-final-off-white mb-4">Live Preview</h3>
              <div className="sticky top-4">
                <ProductCard product={{ id: form.id || 'preview', ...form, images: form.images || [] }} viewMode="grid" />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-final-off-white mb-2">
                  <span className="gradient-text">ADMIN</span> DASHBOARD
                </h1>
                <p className="text-final-off-white/70">
                  Manage your Final Heaven products (Supabase Synced)
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowAddProduct(true)}
                className="bg-final-accent text-final-black px-6 py-3 rounded-lg font-bold flex items-center space-x-2 hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
              >
                <FiPlus className="w-5 h-5" />
                <span>Add Product</span>
              </motion.button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-final-off-white/70 text-sm">Total Products</p>
                  <p className="text-3xl font-bold text-final-off-white">{products.length}</p>
                </div>
                <div className="w-12 h-12 bg-final-accent/20 rounded-full flex items-center justify-center">
                  <FiPackage className="w-6 h-6 text-final-accent" />
                </div>
              </div>
            </div>

            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-final-off-white/70 text-sm">Active Products</p>
                  <p className="text-3xl font-bold text-green-400">{products.filter(p => p.status === 'active').length}</p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                  <FiCheck className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </div>

            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-final-off-white/70 text-sm">New Drops</p>
                  <p className="text-3xl font-bold text-orange-400">{products.filter(p => p.is_new).length}</p>
                </div>
                <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <FiTrendingUp className="w-6 h-6 text-orange-400" />
                </div>
              </div>
            </div>

            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-final-off-white/70 text-sm">Low Stock</p>
                  <p className="text-3xl font-bold text-red-400">{products.filter(p => p.stock <= 5).length}</p>
                </div>
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <FiAlertCircle className="w-6 h-6 text-red-400" />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30 mb-8"
          >
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-4">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white placeholder-final-off-white/50 focus:outline-none focus:border-final-accent"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl border border-final-light-gray/30"
          >
            {loading ? (
              <div className="p-8 text-center text-final-off-white/70">Loading products...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-final-gray/50">
                    <tr>
                      <th className="text-left p-4 text-final-off-white font-semibold">Product</th>
                      <th className="text-left p-4 text-final-off-white font-semibold">Category</th>
                      <th className="text-left p-4 text-final-off-white font-semibold">Price</th>
                      <th className="text-left p-4 text-final-off-white font-semibold">Stock</th>
                      <th className="text-left p-4 text-final-off-white font-semibold">Status</th>
                      <th className="text-left p-4 text-final-off-white font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b border-final-light-gray/20 hover:bg-final-gray/20">
                        <td className="p-4">
                          <div className="flex items-center space-x-3">
                            <img src={product.images?.[0]?.url || '/api/placeholder/50/50'} alt={product.name} className="w-12 h-12 rounded object-cover" />
                            <div>
                              <p className="font-semibold text-final-off-white">{product.name}</p>
                              <div className="flex items-center space-x-1 mt-1">
                                {product.is_new && <span className="bg-final-accent text-final-black text-xs px-1 rounded">NEW</span>}
                                {product.is_limited && <span className="bg-red-500 text-white text-xs px-1 rounded">LIMITED</span>}
                                {product.is_trending && <span className="bg-orange-500 text-white text-xs px-1 rounded">TRENDING</span>}
                                {product.members_only && <span className="bg-purple-500 text-white text-xs px-1 rounded">MEMBERS</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-final-off-white">{product.category}</td>
                        <td className="p-4 text-final-accent font-bold">${product.price}</td>
                        <td className="p-4">
                          <span className={`font-bold ${getStockColor(product.stock)}`}>{product.stock}</span>
                        </td>
                        <td className="p-4">
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(product.status)}`}>
                            {product.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <button className="w-8 h-8 bg-final-accent/20 text-final-accent rounded flex items-center justify-center hover:bg-final-accent hover:text-final-black transition-colors">
                              <FiEye className="w-4 h-4" />
                            </button>
                            <button 
                              className="w-8 h-8 bg-blue-500/20 text-blue-400 rounded flex items-center justify-center hover:bg-blue-500 hover:text-white transition-colors" 
                              onClick={() => setEditingProduct(product)}
                            >
                              <FiEdit className="w-4 h-4" />
                            </button>
                            <button 
                              className="w-8 h-8 bg-red-500/20 text-red-400 rounded flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors" 
                              onClick={() => deleteProduct(product.id)}
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>

          {showAddProduct && (
            <ProductEditorModal 
              product={null} 
              onClose={() => setShowAddProduct(false)} 
              onSave={saveProduct} 
              isNew={true} 
            />
          )}
          {editingProduct && (
            <ProductEditorModal 
              product={editingProduct} 
              onClose={() => setEditingProduct(null)} 
              onSave={saveProduct} 
              isNew={false} 
            />
          )}
        </div>
      </div>
    </Layout>
  )
}


