import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ProductImage {
  url: string;
  color?: string;
}

export interface Product {
  id: string
  name: string
  price: number
  originalPrice?: number
  images?: ProductImage[]
  image?: string // legacy, for backward compatibility
  category: string
  description?: string
  isNew?: boolean
  isLimited?: boolean
  isTrending?: boolean
  membersOnly?: boolean
  releaseDate?: string
  rating?: number
  reviews?: number
  sales?: number
  stock: number
  status: 'active' | 'draft' | 'archived'
  colors?: string[]
  sizes?: string[]
  tags?: string[]
  cardSize?: 'large' | 'medium' | 'small'
}

interface ProductStore {
  products: Product[]
  addProduct: (product: Omit<Product, 'id'>) => void
  updateProduct: (id: string, updates: Partial<Product>) => void
  deleteProduct: (id: string) => void
  getProduct: (id: string) => Product | undefined
  getProductsByCategory: (category: string) => Product[]
  getNewDrops: () => Product[]
  getActiveProducts: () => Product[]
}

// Initial products data
const initialProducts: Product[] = [
  {
    id: 'p1',
    name: 'Neon Dreams Hoodie',
    price: 89.99,
    originalPrice: 119.99,
    images: [
      { url: '/api/placeholder/400/500', color: 'Black' },
      { url: '/api/placeholder/400/500', color: 'Neon Green' },
      { url: '/api/placeholder/400/500', color: 'Cyber Purple' }
    ],
    category: 'Hoodies',
    description: 'The ultimate streetwear statement piece with neon accents and premium comfort.',
    isNew: true,
    isLimited: true,
    isTrending: true,
    membersOnly: false,
    releaseDate: '2024-01-20',
    rating: 4.8,
    reviews: 127,
    sales: 127,
    stock: 45,
    status: 'active',
    colors: ['Black', 'Neon Green', 'Cyber Purple'],
    sizes: ['S', 'M', 'L', 'XL'],
    tags: ['Neon', 'Limited', 'Trending'],
    cardSize: 'large'
  },
  {
    id: 'p2',
    name: 'Cyberpunk Tee',
    price: 49.99,
    originalPrice: 69.99,
    images: [
      { url: '/api/placeholder/400/500', color: 'White' },
      { url: '/api/placeholder/400/500', color: 'Black' },
      { url: '/api/placeholder/400/500', color: 'Neon Pink' }
    ],
    category: 'T-Shirts',
    description: 'Futuristic design meets street style in this cutting-edge t-shirt.',
    isNew: true,
    isLimited: false,
    isTrending: false,
    membersOnly: true,
    releaseDate: '2024-01-18',
    rating: 4.9,
    reviews: 89,
    sales: 89,
    stock: 12,
    status: 'active',
    colors: ['White', 'Black', 'Neon Pink'],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    tags: ['Cyberpunk', 'Members Only'],
    cardSize: 'medium'
  },
  {
    id: 'p3',
    name: 'Urban Cargo Pants',
    price: 129.99,
    originalPrice: 159.99,
    images: [
      { url: '/api/placeholder/400/500', color: 'Black' },
      { url: '/api/placeholder/400/500', color: 'Olive' },
      { url: '/api/placeholder/400/500', color: 'Camo' }
    ],
    category: 'Pants',
    description: 'Functional cargo pants with modern streetwear aesthetics.',
    isNew: true,
    isLimited: true,
    isTrending: true,
    membersOnly: false,
    releaseDate: '2024-01-15',
    rating: 4.7,
    reviews: 56,
    sales: 56,
    stock: 3,
    status: 'active',
    colors: ['Black', 'Olive', 'Camo'],
    sizes: ['30', '32', '34', '36', '38'],
    tags: ['Urban', 'Limited'],
    cardSize: 'large'
  }
]

export const useProductStore = create<ProductStore>()(
  persist(
    (set, get) => ({
      products: initialProducts,
      
      addProduct: (productData) => {
        const newProduct: Product = {
          ...productData,
          id: `p${Date.now()}`, // Generate unique ID
          status: productData.status || 'active',
          stock: productData.stock || 0,
          sales: productData.sales || 0,
          reviews: productData.reviews || 0
        }
        set((state) => ({
          products: [...state.products, newProduct]
        }))
      },
      
      updateProduct: (id, updates) => {
        set((state) => ({
          products: state.products.map((product) =>
            product.id === id ? { ...product, ...updates } : product
          )
        }))
      },
      
      deleteProduct: (id) => {
        set((state) => ({
          products: state.products.filter((product) => product.id !== id)
        }))
      },
      
      getProduct: (id) => {
        return get().products.find((product) => product.id === id)
      },
      
      getProductsByCategory: (category) => {
        return get().products.filter((product) => 
          product.category === category && product.status === 'active'
        )
      },
      
      getNewDrops: () => {
        return get().products.filter((product) => 
          product.isNew && product.status === 'active'
        )
      },
      
      getActiveProducts: () => {
        return get().products.filter((product) => product.status === 'active')
      }
    }),
    {
      name: 'final-heaven-products',
    }
  )
) 