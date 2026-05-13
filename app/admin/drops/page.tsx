'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  FiCalendar, FiClock, FiUsers, FiEye, FiEdit, FiTrash2, FiPlus, FiUpload,
  FiTrendingUp, FiStar, FiDollarSign, FiPackage, FiSettings, FiArrowRight,
  FiCheck, FiX, FiAlertCircle, FiImage, FiTag
} from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'

// 1. Move mockDrops to useState, use real placeholder images, and enable CRUD
const initialDrops = [
  {
    id: 'drop1',
    name: 'Neon Dreams Collection',
    description: 'The ultimate streetwear statement piece with neon accents and premium comfort.',
    releaseDate: '2024-01-25',
    releaseTime: '10:00',
    status: 'scheduled',
    products: [
      { id: 'p1', name: 'Neon Dreams Hoodie', price: 89.99, stock: 100, image: 'https://picsum.photos/100/100?random=1' },
      { id: 'p2', name: 'Neon Dreams Tee', price: 49.99, stock: 150, image: 'https://picsum.photos/100/100?random=2' },
      { id: 'p3', name: 'Neon Dreams Pants', price: 129.99, stock: 75, image: 'https://picsum.photos/100/100?random=3' }
    ],
    isMembersOnly: false,
    earlyAccessHours: 24,
    previewImage: 'https://picsum.photos/400/300?random=1',
    tags: ['Neon', 'Limited', 'Trending']
  },
  {
    id: 'drop2',
    name: 'Cyberpunk Elite',
    description: 'Exclusive cyberpunk-inspired collection for the elite members.',
    releaseDate: '2024-01-30',
    releaseTime: '12:00',
    status: 'draft',
    products: [
      { id: 'p4', name: 'Cyberpunk Jacket', price: 199.99, stock: 50, image: 'https://picsum.photos/100/100?random=4' },
      { id: 'p5', name: 'Cyberpunk Sneakers', price: 299.99, stock: 30, image: 'https://picsum.photos/100/100?random=5' }
    ],
    isMembersOnly: true,
    earlyAccessHours: 48,
    previewImage: 'https://picsum.photos/400/300?random=2',
    tags: ['Cyberpunk', 'Members Only', 'Limited Edition']
  },
  {
    id: 'drop3',
    name: 'Urban Legends',
    description: 'Classic streetwear with a modern twist.',
    releaseDate: '2024-02-05',
    releaseTime: '09:00',
    status: 'published',
    products: [
      { id: 'p6', name: 'Urban Cap', price: 39.99, stock: 200, image: 'https://picsum.photos/100/100?random=6' },
      { id: 'p7', name: 'Urban Sweater', price: 79.99, stock: 120, image: 'https://picsum.photos/100/100?random=7' }
    ],
    isMembersOnly: false,
    earlyAccessHours: 12,
    previewImage: 'https://picsum.photos/400/300?random=3',
    tags: ['Urban', 'Classic']
  }
]

const statusConfig = {
  draft: { color: 'text-gray-400', bg: 'bg-gray-400/20', label: 'Draft' },
  scheduled: { color: 'text-blue-400', bg: 'bg-blue-400/20', label: 'Scheduled' },
  published: { color: 'text-green-400', bg: 'bg-green-400/20', label: 'Published' },
  archived: { color: 'text-red-400', bg: 'bg-red-400/20', label: 'Archived' }
}

export default function DropsManagementPage() {
  // 2. Use state for drops
  const [drops, setDrops] = useState<any[]>(initialDrops)
  const [selectedDrop, setSelectedDrop] = useState<any>(null)
  const [showCreateDrop, setShowCreateDrop] = useState(false)
  const [editingDrop, setEditingDrop] = useState<any>(null)
  const [filterStatus, setFilterStatus] = useState('all')

  // 3. Filtered drops
  const filteredDrops = drops.filter(drop => 
    filterStatus === 'all' || drop.status === filterStatus
  )

  const getStatusConfig = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig] || statusConfig.draft
  }

  const getDaysUntilRelease = (releaseDate: string) => {
    const today = new Date()
    const release = new Date(releaseDate)
    const diffTime = release.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  // 4. Update DropEditorModal to use picsum.photos as default, and ensure uploaded images are visible
  function DropEditorModal({ drop, onClose, onSave, isNew = false }: { drop: any, onClose: () => void, onSave: (d: any) => void, isNew?: boolean }) {
    const [form, setForm] = useState<any>(drop || {
      id: '',
      name: '',
      description: '',
      releaseDate: '',
      releaseTime: '',
      status: 'draft',
      products: [],
      isMembersOnly: false,
      earlyAccessHours: 24,
      previewImage: 'https://picsum.photos/400/300?random=' + Math.floor(Math.random()*1000),
      tags: []
    })
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string>(form.previewImage)

    function handleChange(e: any) {
      const { name, value, type, checked } = e.target
      setForm((f: any) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
      if (name === 'previewImage') setImagePreview(value)
    }

    function handleArrayChange(name: string, value: string) {
      setForm((f: any) => ({ ...f, [name]: value.split(',').map((v: string) => v.trim()).filter(v => v) }))
    }

    function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0]
      if (file) {
        setImageFile(file)
        const url = URL.createObjectURL(file)
        setImagePreview(url)
        const reader = new FileReader()
        reader.onload = (ev) => {
          setForm((f: any) => ({ ...f, previewImage: ev.target?.result as string }))
        }
        reader.readAsDataURL(file)
      }
    }

    function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      if (isNew) {
        const { id, ...dropData } = form
        dropData.id = `drop${Date.now()}`
        // In a real app, you'd call an API here
        console.log('Creating new drop:', dropData)
      } else {
        // In a real app, you'd call an API here
        console.log('Updating drop:', form)
      }
      onSave(form)
      onClose()
    }

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-final-dark-gray rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8 relative" onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-final-gray rounded-full flex items-center justify-center text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors">
            <FiX className="w-4 h-4" />
          </button>
          <h2 className="text-2xl font-bold text-final-off-white mb-6">
            {isNew ? 'Create New Drop' : 'Edit Drop'}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-final-off-white/70 text-sm mb-1">Drop Name *</label>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-final-off-white/70 text-sm mb-1">Release Date *</label>
                  <input 
                    name="releaseDate" 
                    type="date" 
                    value={form.releaseDate} 
                    onChange={handleChange} 
                    required
                    className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                  />
                </div>
                <div>
                  <label className="block text-final-off-white/70 text-sm mb-1">Release Time *</label>
                  <input 
                    name="releaseTime" 
                    type="time" 
                    value={form.releaseTime} 
                    onChange={handleChange} 
                    required
                    className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-final-off-white/70 text-sm mb-1">Early Access Hours</label>
                  <input 
                    name="earlyAccessHours" 
                    type="number" 
                    value={form.earlyAccessHours} 
                    onChange={handleChange} 
                    className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent" 
                  />
                </div>
                <div>
                  <label className="block text-final-off-white/70 text-sm mb-1">Status *</label>
                  <select 
                    name="status" 
                    value={form.status} 
                    onChange={handleChange}
                    required
                    className="w-full bg-final-gray border border-final-light-gray/30 rounded-lg px-4 py-2 text-final-off-white focus:outline-none focus:border-final-accent"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-final-off-white/70 text-sm mb-1">Upload Preview Image</label>
                {/* Drag-and-drop area */}
                <div
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      setImageFile(file);
                      const url = URL.createObjectURL(file);
                      setImagePreview(url);
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setForm((f: any) => ({ ...f, previewImage: ev.target?.result as string }));
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full border-2 border-dashed border-final-accent/50 rounded-lg p-4 mb-2 flex flex-col items-center justify-center cursor-pointer hover:border-final-accent transition-colors bg-final-gray/40"
                  style={{ minHeight: 80 }}
                >
                  <span className="text-final-off-white/60 text-sm mb-2">Drag & drop an image here, or click to select</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="block w-full text-final-off-white mb-2 opacity-0 absolute inset-0 cursor-pointer"
                    style={{ position: 'absolute', width: '100%', height: '100%', left: 0, top: 0 }}
                    tabIndex={-1}
                    aria-label="Image file input"
                  />
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview" className="mt-2 rounded-lg max-h-40 object-contain border border-final-light-gray/30" />
                  )}
                </div>
                <label className="block text-final-off-white/50 text-xs mb-1">Or paste image URL (optional)</label>
                <input
                  name="previewImage"
                  value={form.previewImage}
                  onChange={handleChange}
                  placeholder="Paste image URL (optional)"
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
                  <input type="checkbox" name="isMembersOnly" checked={form.isMembersOnly} onChange={handleChange} /> Members Only
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
                  {isNew ? 'Create Drop' : 'Save Changes'}
                </button>
              </div>
            </form>
            <div>
              <h3 className="text-lg font-semibold text-final-off-white mb-4">Live Preview</h3>
              <div className="sticky top-4">
                <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl border border-final-light-gray/30 overflow-hidden">
                  <div className="relative h-48 overflow-hidden">
                    <img 
                      src={form.previewImage} 
                      alt={form.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-final-black/80 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-bold text-final-off-white">{form.name || 'Drop Name'}</h3>
                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusConfig(form.status).bg} ${getStatusConfig(form.status).color}`}>
                          {getStatusConfig(form.status).label}
                        </span>
                      </div>
                      <p className="text-final-off-white/70 text-sm line-clamp-2">{form.description || 'Drop description will appear here'}</p>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-final-off-white/70 text-sm">Release Date</p>
                        <p className="text-final-off-white font-semibold">{form.releaseDate || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-final-off-white/70 text-sm">Release Time</p>
                        <p className="text-final-off-white font-semibold">{form.releaseTime || 'Not set'}</p>
                      </div>
                    </div>
                    {form.tags && form.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {form.tags.map((tag: string) => (
                          <span key={tag} className="bg-final-gray text-final-off-white text-xs px-2 py-1 rounded">
                            {tag}
                          </span>
                        ))}
                        {form.isMembersOnly && (
                          <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded">
                            MEMBERS ONLY
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  // 5. Add delete and publish handlers
  function handleDeleteDrop(dropId: string) {
    setDrops(drops => drops.filter(d => d.id !== dropId))
    setSelectedDrop(null)
    setEditingDrop(null)
  }

  function handleSaveDrop(updatedDrop: any) {
    setDrops(drops => drops.map(d => d.id === updatedDrop.id ? updatedDrop : d))
  }

  function handleCreateDrop(newDrop: any) {
    setDrops(drops => [{ ...newDrop, id: `drop${Date.now()}` }, ...drops])
  }

  function handlePublishDrop(drop: any) {
    setDrops(drops => drops.map(d => d.id === drop.id ? { ...d, status: 'published' } : d))
    setSelectedDrop(null)
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-final-off-white mb-2">
                  <span className="gradient-text">DROPS</span> MANAGEMENT
                </h1>
                <p className="text-final-off-white/70">
                  Schedule, manage, and track your product drops
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCreateDrop(true)}
                className="bg-final-accent text-final-black px-6 py-3 rounded-lg font-bold flex items-center space-x-2 hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
              >
                <FiPlus className="w-5 h-5" />
                <span>Create Drop</span>
              </motion.button>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-final-off-white/70 text-sm">Total Drops</p>
                  <p className="text-3xl font-bold text-final-off-white">{drops.length}</p>
                </div>
                <div className="w-12 h-12 bg-final-accent/20 rounded-full flex items-center justify-center">
                  <FiTrendingUp className="w-6 h-6 text-final-accent" />
                </div>
              </div>
            </div>

            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-final-off-white/70 text-sm">Scheduled</p>
                  <p className="text-3xl font-bold text-blue-400">{drops.filter(d => d.status === 'scheduled').length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <FiCalendar className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </div>

            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-final-off-white/70 text-sm">Published</p>
                  <p className="text-3xl font-bold text-green-400">{drops.filter(d => d.status === 'published').length}</p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                  <FiCheck className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </div>

            <div className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-final-off-white/70 text-sm">Drafts</p>
                  <p className="text-3xl font-bold text-gray-400">{drops.filter(d => d.status === 'draft').length}</p>
                </div>
                <div className="w-12 h-12 bg-gray-500/20 rounded-full flex items-center justify-center">
                  <FiEdit className="w-6 h-6 text-gray-400" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mb-8"
          >
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                  filterStatus === 'all'
                    ? 'bg-final-accent text-final-black'
                    : 'bg-final-gray text-final-off-white hover:bg-final-accent hover:text-final-black'
                }`}
              >
                All Drops
              </button>
              <button
                onClick={() => setFilterStatus('scheduled')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                  filterStatus === 'scheduled'
                    ? 'bg-final-accent text-final-black'
                    : 'bg-final-gray text-final-off-white hover:bg-final-accent hover:text-final-black'
                }`}
              >
                Scheduled
              </button>
              <button
                onClick={() => setFilterStatus('published')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                  filterStatus === 'published'
                    ? 'bg-final-accent text-final-black'
                    : 'bg-final-gray text-final-off-white hover:bg-final-accent hover:text-final-black'
                }`}
              >
                Published
              </button>
              <button
                onClick={() => setFilterStatus('draft')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                  filterStatus === 'draft'
                    ? 'bg-final-accent text-final-black'
                    : 'bg-final-gray text-final-off-white hover:bg-final-accent hover:text-final-black'
                }`}
              >
                Drafts
              </button>
            </div>
          </motion.div>

          {/* Drops Grid */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            {filteredDrops.map((drop) => (
              <motion.div
                key={drop.id}
                whileHover={{ y: -4 }}
                className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl border border-final-light-gray/30 overflow-hidden"
              >
                {/* Drop Header */}
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={drop.previewImage} 
                    alt={drop.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-final-black/80 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xl font-bold text-final-off-white">{drop.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusConfig(drop.status).bg} ${getStatusConfig(drop.status).color}`}>
                        {getStatusConfig(drop.status).label}
                      </span>
                    </div>
                    <p className="text-final-off-white/70 text-sm line-clamp-2">{drop.description}</p>
                  </div>
                </div>

                {/* Drop Details */}
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-final-off-white/70 text-sm">Release Date</p>
                      <p className="text-final-off-white font-semibold">{drop.releaseDate}</p>
                    </div>
                    <div>
                      <p className="text-final-off-white/70 text-sm">Release Time</p>
                      <p className="text-final-off-white font-semibold">{drop.releaseTime}</p>
                    </div>
                    <div>
                      <p className="text-final-off-white/70 text-sm">Products</p>
                      <p className="text-final-off-white font-semibold">{drop.products.length} items</p>
                    </div>
                    <div>
                      <p className="text-final-off-white/70 text-sm">Early Access</p>
                      <p className="text-final-off-white font-semibold">{drop.earlyAccessHours}h</p>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {drop.tags.map((tag: string) => (
                      <span key={tag} className="bg-final-gray text-final-off-white text-xs px-2 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                    {drop.isMembersOnly && (
                      <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded">
                        MEMBERS ONLY
                      </span>
                    )}
                  </div>

                  {/* Countdown or Status */}
                  {drop.status === 'scheduled' && (
                    <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 mb-4">
                      <div className="flex items-center space-x-2">
                        <FiClock className="w-4 h-4 text-blue-400" />
                        <span className="text-blue-400 text-sm">
                          {getDaysUntilRelease(drop.releaseDate)} days until release
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => setSelectedDrop(drop)}
                      className="flex-1 bg-final-accent text-final-black py-2 rounded-lg font-semibold text-sm hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                    >
                      <FiEye className="w-4 h-4 inline mr-2" />
                      View Details
                    </button>
                    <button 
                      onClick={() => setEditingDrop(drop)}
                      className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center hover:bg-blue-500 hover:text-white transition-colors"
                    >
                      <FiEdit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteDrop(drop.id)}
                      className="w-10 h-10 bg-red-500/20 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Drop Details Modal */}
          {selectedDrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setSelectedDrop(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-final-dark-gray rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-final-off-white">{selectedDrop.name}</h2>
                    <button
                      onClick={() => setSelectedDrop(null)}
                      className="w-8 h-8 bg-final-gray rounded-full flex items-center justify-center text-final-off-white hover:bg-final-accent hover:text-final-black transition-colors"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Drop Info */}
                    <div>
                      <h3 className="text-lg font-semibold text-final-off-white mb-4">Drop Information</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-final-off-white/70 text-sm mb-1">Description</label>
                          <p className="text-final-off-white">{selectedDrop.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-final-off-white/70 text-sm mb-1">Release Date</label>
                            <p className="text-final-off-white font-semibold">{selectedDrop.releaseDate}</p>
                          </div>
                          <div>
                            <label className="block text-final-off-white/70 text-sm mb-1">Release Time</label>
                            <p className="text-final-off-white font-semibold">{selectedDrop.releaseTime}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-final-off-white/70 text-sm mb-1">Early Access</label>
                            <p className="text-final-off-white font-semibold">{selectedDrop.earlyAccessHours} hours</p>
                          </div>
                          <div>
                            <label className="block text-final-off-white/70 text-sm mb-1">Status</label>
                            <span className={`text-xs px-2 py-1 rounded-full ${getStatusConfig(selectedDrop.status).bg} ${getStatusConfig(selectedDrop.status).color}`}>
                              {getStatusConfig(selectedDrop.status).label}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Products */}
                    <div>
                      <h3 className="text-lg font-semibold text-final-off-white mb-4">Products ({selectedDrop.products.length})</h3>
                      <div className="space-y-3">
                        {selectedDrop.products.map((product: any) => (
                          <div key={product.id} className="flex items-center space-x-3 p-3 bg-final-gray rounded-lg">
                            <img src={product.image} alt={product.name} className="w-12 h-12 rounded object-cover" />
                            <div className="flex-1">
                              <p className="font-semibold text-final-off-white">{product.name}</p>
                              <p className="text-final-off-white/70 text-sm">Stock: {product.stock}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-final-accent">${product.price}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end space-x-4 mt-8 pt-6 border-t border-final-light-gray/30">
                    <button 
                      onClick={() => {
                        setEditingDrop(selectedDrop)
                        setSelectedDrop(null)
                      }}
                      className="px-6 py-2 bg-final-gray text-final-off-white rounded-lg font-semibold hover:bg-final-accent hover:text-final-black transition-colors"
                    >
                      Edit Drop
                    </button>
                    <button 
                      onClick={() => handlePublishDrop(selectedDrop)}
                      className="px-6 py-2 bg-final-accent text-final-black rounded-lg font-semibold hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
                    >
                      Publish Drop
                    </button>
                    <button 
                      onClick={() => handleDeleteDrop(selectedDrop.id)}
                      className="px-6 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-700 transition-all duration-300"
                    >
                      Delete Drop
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Edit Drop Modal */}
          {editingDrop && (
            <DropEditorModal 
              drop={editingDrop} 
              onClose={() => setEditingDrop(null)} 
              onSave={(drop) => {
                handleSaveDrop(drop)
                setEditingDrop(null)
              }} 
              isNew={false} 
            />
          )}

          {/* Create Drop Modal */}
          {showCreateDrop && (
            <DropEditorModal 
              drop={null} 
              onClose={() => setShowCreateDrop(false)} 
              onSave={(drop) => {
                handleCreateDrop(drop)
                setShowCreateDrop(false)
              }} 
              isNew={true} 
            />
          )}
        </div>
      </div>
    </Layout>
  )
} 