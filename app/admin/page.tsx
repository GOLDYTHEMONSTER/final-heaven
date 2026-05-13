'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  FiPackage, FiPlus, FiEdit, FiTrash2, FiEye, FiCheck, FiX, 
  FiBarChart, FiShoppingBag, FiTrendingUp, FiAlertCircle
} from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'
import { ProductCard } from '@/components/ui/ProductCard'
import { useProductStore, Product } from '@/lib/stores/productStore'

const categories = ['All', 'Hoodies', 'T-Shirts', 'Pants', 'Jackets', 'Sweaters', 'Accessories', 'Footwear']
const statuses = ['All', 'Active', 'Draft', 'Archived']

export default function AdminPage() {
  const { products, addProduct, updateProduct, deleteProduct } = useProductStore()
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

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

  function ProductEditorModal({ product, onClose, onSave, isNew = false }: { product: Product | null, onClose: () => void, onSave: (p: Product) => void, isNew?: boolean }) {
    const [form, setForm] = useState<Product & { images: { url: string, color?: string }[] }>(product ? { ...product, images: product.images || (product.image ? [{ url: product.image }] : []), image: product.image || '' } : {
      id: '',
      name: '',
      price: 0,
      images: [],
      image: '',
      category: 'T-Shirts',
      description: '',
      stock: 0,
      status: 'active',
      colors: [],
      sizes: [],
      tags: []
    })
    const [dragActive, setDragActive] = useState(false)

    function handleChange(e: any) {
      const { name, value, type, checked } = e.target
      setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
    }

    function handleArrayChange(name: string, value: string) {
      setForm(f => ({ ...f, [name]: value.split(',').map((v: string) => v.trim()).filter(v => v) }))
    }

    function handleImageFiles(files: FileList | null) {
      if (!files) return
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = (ev) => {
            setForm(f => ({ ...f, images: [...(f.images || []), { url: ev.target?.result as string }] }))
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
      if (url) setForm(f => ({ ...f, images: [...(f.images || []), { url }] }))
    }

    function handleImageRemove(idx: number) {
      setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }))
    }

    function handleImageColor(idx: number, color: string) {
      setForm(f => ({ ...f, images: f.images.map((img, i) => i === idx ? { ...img, color } : img) }))
    }

    function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      // Remove legacy image field
      const { image, ...rest } = form as any
      if (isNew) {
        const { id, ...productData } = rest
        onSave(productData)
      } else {
        onSave(rest)
      }
      onClose()
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
                    name="originalPrice" 
                    type="number" 
                    step="0.01"
                    value={form.originalPrice || ''} 
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
                  className={`w-full border-2 border-dashed ${dragActive ? 'border-final-accent' : 'border-final-accent/50'} rounded-lg p-4 mb-2 flex flex-col items-center justify-center cursor-pointer bg-final-gray/40`}
                  style={{ minHeight: 80 }}
                >
                  <span className="text-final-off-white/60 text-sm mb-2">Drag & drop images here, or click to select</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageInput}
                    className="block w-full text-final-off-white mb-2 opacity-0 absolute inset-0 cursor-pointer"
                    style={{ position: 'absolute', width: '100%', height: '100%', left: 0, top: 0 }}
                    tabIndex={-1}
                    aria-label="Image file input"
                  />
                  <div className="flex flex-wrap gap-4 mt-2 w-full justify-center">
                    {form.images && form.images.map((img, idx) => (
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
              <div>
                <label className="block text-final-off-white/70 text-sm mb-1">Colors (comma separated)</label>
                <input 
                  name="colors" 
                  value={form.colors?.join(', ') || ''} 
                  onChange={e => handleArrayChange('colors', e.target.value)} 
                  placeholder="Black, White, Red"
                  className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                />
              </div>
              <div>
                <label className="block text-final-off-white/70 text-sm mb-1">Tags (comma separated)</label>
                <input 
                  name="tags" 
                  value={form.tags?.join(', ') || ''} 
                  onChange={e => handleArrayChange('tags', e.target.value)} 
                  placeholder="Limited, Trending, New"
                  className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                />
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="checkbox" name="isNew" checked={form.isNew} onChange={handleChange} /> New
                </label>
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="checkbox" name="isLimited" checked={form.isLimited} onChange={handleChange} /> Limited
                </label>
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="checkbox" name="isTrending" checked={form.isTrending} onChange={handleChange} /> Trending
                </label>
                <label className="flex items-center gap-2 text-final-off-white/80">
                  <input type="checkbox" name="membersOnly" checked={form.membersOnly} onChange={handleChange} /> Members Only
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
              <div className="flex justify-end gap-4 pt-4">
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
                <ProductCard product={{ ...form, image: form.image || '' }} viewMode="grid" />
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
                  Manage your Final Heaven products
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
                  <p className="text-3xl font-bold text-orange-400">{products.filter(p => p.isNew).length}</p>
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
                          <img src={product.image} alt={product.name} className="w-12 h-12 rounded object-cover" />
                          <div>
                            <p className="font-semibold text-final-off-white">{product.name}</p>
                            <div className="flex items-center space-x-1 mt-1">
                              {product.isNew && <span className="bg-final-accent text-final-black text-xs px-1 rounded">NEW</span>}
                              {product.isLimited && <span className="bg-red-500 text-white text-xs px-1 rounded">LIMITED</span>}
                              {product.isTrending && <span className="bg-orange-500 text-white text-xs px-1 rounded">TRENDING</span>}
                              {product.membersOnly && <span className="bg-purple-500 text-white text-xs px-1 rounded">MEMBERS</span>}
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
          </motion.div>

          {showAddProduct && (
            <ProductEditorModal 
              product={null} 
              onClose={() => setShowAddProduct(false)} 
              onSave={(product) => {
                addProduct(product)
                setShowAddProduct(false)
              }} 
              isNew={true} 
            />
          )}
          {editingProduct && (
            <ProductEditorModal 
              product={editingProduct} 
              onClose={() => setEditingProduct(null)} 
              onSave={(product) => {
                updateProduct(product.id, product)
                setEditingProduct(null)
              }} 
              isNew={false} 
            />
          )}
        </div>
      </div>
    </Layout>
  )
}
