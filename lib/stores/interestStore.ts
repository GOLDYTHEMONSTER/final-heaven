import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ProductInterest {
  productId: string
  viewedAt: number
  timeSpent: number // in milliseconds
  category: string
  tags: string[]
}

export interface UserInterestData {
  viewedProducts: ProductInterest[]
  searchHistory: string[]
  cartAdditions: string[] // product IDs
  favoritedCategories: string[]
}

interface InterestStore {
  interests: UserInterestData
  trackProductView: (productId: string, category: string, tags: string[]) => void
  updateTimeSpent: (productId: string, timeSpent: number) => void
  addToSearchHistory: (query: string) => void
  trackCartAddition: (productId: string) => void
  addFavoriteCategory: (category: string) => void
  getRecentCategories: (limit?: number) => string[]
  getMostViewedCategories: () => { category: string; count: number }[]
  getRelatedProductIds: (category: string, tags: string[], limit?: number) => string[]
  clearInterests: () => void
}

const initialInterestData: UserInterestData = {
  viewedProducts: [],
  searchHistory: [],
  cartAdditions: [],
  favoritedCategories: []
}

export const useInterestStore = create<InterestStore>()(
  persist(
    (set, get) => ({
      interests: initialInterestData,

      trackProductView: (productId, category, tags) => {
        set((state) => {
          const existingIndex = state.interests.viewedProducts.findIndex(
            (p) => p.productId === productId
          )

          let updatedProducts: ProductInterest[]
          if (existingIndex > -1) {
            // Update existing view
            updatedProducts = [...state.interests.viewedProducts]
            updatedProducts[existingIndex] = {
              ...updatedProducts[existingIndex],
              viewedAt: Date.now(),
              timeSpent: 0
            }
          } else {
            // Add new view
            updatedProducts = [
              ...state.interests.viewedProducts,
              {
                productId,
                viewedAt: Date.now(),
                timeSpent: 0,
                category,
                tags
              }
            ]
          }

          // Keep only last 50 views
          if (updatedProducts.length > 50) {
            updatedProducts = updatedProducts.slice(-50)
          }

          return {
            interests: {
              ...state.interests,
              viewedProducts: updatedProducts
            }
          }
        })
      },

      updateTimeSpent: (productId, timeSpent) => {
        set((state) => ({
          interests: {
            ...state.interests,
            viewedProducts: state.interests.viewedProducts.map((p) =>
              p.productId === productId ? { ...p, timeSpent } : p
            )
          }
        }))
      },

      addToSearchHistory: (query) => {
        set((state) => {
          const trimmedQuery = query.trim()
          if (!trimmedQuery) return state

          // Remove duplicates - keep only the latest occurrence
          const filtered = state.interests.searchHistory.filter((q) => q !== trimmedQuery)
          const updated = [trimmedQuery, ...filtered].slice(0, 10) // Keep last 10 searches

          return {
            interests: {
              ...state.interests,
              searchHistory: updated
            }
          }
        })
      },

      trackCartAddition: (productId) => {
        set((state) => {
          const filtered = state.interests.cartAdditions.filter((id) => id !== productId)
          return {
            interests: {
              ...state.interests,
              cartAdditions: [productId, ...filtered].slice(0, 20) // Keep last 20
            }
          }
        })
      },

      addFavoriteCategory: (category) => {
        set((state) => {
          const exists = state.interests.favoritedCategories.includes(category)
          if (exists) return state

          return {
            interests: {
              ...state.interests,
              favoritedCategories: [...state.interests.favoritedCategories, category]
            }
          }
        })
      },

      getRecentCategories: (limit = 5) => {
        const { interests } = get()
        const categoryMap = new Map<string, number>()

        // Count categories from recent views (weight by recency)
        interests.viewedProducts.slice(-20).forEach((view, index) => {
          const weight = index + 1 // More recent = higher weight
          categoryMap.set(view.category, (categoryMap.get(view.category) || 0) + weight)
        })

        return Array.from(categoryMap.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, limit)
          .map(([category]) => category)
      },

      getMostViewedCategories: () => {
        const { interests } = get()
        const categoryMap = new Map<string, number>()

        interests.viewedProducts.forEach((view) => {
          categoryMap.set(view.category, (categoryMap.get(view.category) || 0) + 1)
        })

        return Array.from(categoryMap.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count)
      },

      getRelatedProductIds: (category, tags, limit = 5) => {
        const { interests } = get()
        const productScores = new Map<string, number>()

        // Score products based on:
        // 1. Same category (higher weight)
        // 2. Shared tags
        // 3. Recent views
        interests.viewedProducts.forEach((view, index) => {
          if (view.productId === category) return // Skip if same product

          let score = 0

          // Category match (high priority)
          if (view.category === category) {
            score += 10
          }

          // Tag matches
          const sharedTags = view.tags.filter((tag) => tags.includes(tag))
          score += sharedTags.length * 5

          // Recency bonus
          const recencyBonus = Math.max(0, 10 - (interests.viewedProducts.length - index) * 0.5)
          score += recencyBonus

          // Popularity (time spent)
          if (view.timeSpent > 10000) {
            score += 3
          }

          if (score > 0) {
            productScores.set(view.productId, (productScores.get(view.productId) || 0) + score)
          }
        })

        return Array.from(productScores.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, limit)
          .map(([productId]) => productId)
      },

      clearInterests: () => {
        set({ interests: initialInterestData })
      }
    }),
    {
      name: 'interest-store'
    }
  )
)
