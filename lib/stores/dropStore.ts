import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from './productStore'

export interface Drop {
  id: string
  name: string
  description?: string
  date: string
  banner: string // image URL or data URL
  productIds: string[] // assigned product IDs
}

interface DropStore {
  drops: Drop[]
  addDrop: (drop: Omit<Drop, 'id'>) => void
  updateDrop: (id: string, updates: Partial<Drop>) => void
  deleteDrop: (id: string) => void
  assignProduct: (dropId: string, productId: string) => void
  unassignProduct: (dropId: string, productId: string) => void
}

export const useDropStore = create<DropStore>()(
  persist(
    (set, get) => ({
      drops: [],
      addDrop: (dropData) => {
        const newDrop: Drop = {
          ...dropData,
          id: `d${Date.now()}`,
          productIds: dropData.productIds || [],
        }
        set((state) => ({ drops: [...state.drops, newDrop] }))
      },
      updateDrop: (id, updates) => {
        set((state) => ({
          drops: state.drops.map((drop) =>
            drop.id === id ? { ...drop, ...updates } : drop
          )
        }))
      },
      deleteDrop: (id) => {
        set((state) => ({
          drops: state.drops.filter((drop) => drop.id !== id)
        }))
      },
      assignProduct: (dropId, productId) => {
        set((state) => ({
          drops: state.drops.map((drop) =>
            drop.id === dropId && !drop.productIds.includes(productId)
              ? { ...drop, productIds: [...drop.productIds, productId] }
              : drop
          )
        }))
      },
      unassignProduct: (dropId, productId) => {
        set((state) => ({
          drops: state.drops.map((drop) =>
            drop.id === dropId
              ? { ...drop, productIds: drop.productIds.filter((id) => id !== productId) }
              : drop
          )
        }))
      },
    }),
    { name: 'final-heaven-drops' }
  )
) 