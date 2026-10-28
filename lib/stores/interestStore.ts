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
  /** Chosen in "What are you into?" on the homepage feed. Optional; older saved data has none. */
  pickedCategories?: string[]
  /** Products hyped in this browser: a strong taste signal (lib/discovery buildProfile). Optional; older saved data has none. */
  hypedProducts?: { productId: string; category: string; tags: string[]; at: number }[]
}

interface InterestStore {
  interests: UserInterestData
  trackProductView: (productId: string, category: string, tags: string[]) => void
  updateTimeSpent: (productId: string, timeSpent: number) => void
  addToSearchHistory: (query: string) => void
  trackCartAddition: (productId: string) => void
  addFavoriteCategory: (category: string) => void
  trackHype: (productId: string, category: string, tags: string[]) => void
  togglePickedCategory: (category: string) => void
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

      trackHype: (productId, category, tags) => {
        set((state) => {
          const hyped = (state.interests.hypedProducts ?? []).filter((h) => h.productId !== productId)
          const favorited = state.interests.favoritedCategories.includes(category)
            ? state.interests.favoritedCategories
            : [...state.interests.favoritedCategories, category]
          return {
            interests: {
              ...state.interests,
              favoritedCategories: favorited,
              hypedProducts: [...hyped, { productId, category, tags, at: Date.now() }].slice(-30),
            },
          }
        })
      },

      togglePickedCategory: (category) => {
        set((state) => {
          const picked = state.interests.pickedCategories ?? []
          return {
            interests: {
              ...state.interests,
              pickedCategories: picked.includes(category) ? picked.filter((c) => c !== category) : [...picked, category],
            },
          }
        })
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
