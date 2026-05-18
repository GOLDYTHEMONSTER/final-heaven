'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiSearch, FiX, FiClock, FiTrendingUp } from 'react-icons/fi'
import { useInterestStore } from '@/lib/stores/interestStore'

interface SearchBarProps {
  onSearch: (query: string, category?: string) => void
  placeholder?: string
  className?: string
  allProducts?: Array<{ id: string; name: string; category: string }>
}

export function SearchBar({
  onSearch,
  placeholder = 'Search products, styles, vibes...',
  className = '',
  allProducts = []
}: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Array<{ type: 'product' | 'search' | 'category'; value: string; label: string }>>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout>()

  const { interests, addToSearchHistory } = useInterestStore()

  // Generate suggestions based on query and user history
  const generateSuggestions = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        // Show recent searches and trending categories when empty
        const recentSearches = interests.searchHistory.slice(0, 4).map((search) => ({
          type: 'search' as const,
          value: search,
          label: search
        }))

        const trendingCategories = interests.favoritedCategories.slice(0, 3).map((cat) => ({
          type: 'category' as const,
          value: cat,
          label: `Browse ${cat}`
        }))

        setSuggestions([...recentSearches, ...trendingCategories])
        return
      }

      const lowerQuery = searchQuery.toLowerCase()
      const productMatches: Array<{
        type: 'product' | 'search' | 'category'
        value: string
        label: string
      }> = []
      const categoryMatches: Array<{
        type: 'product' | 'search' | 'category'
        value: string
        label: string
      }> = []

      // Search products by name and category
      const matchedProducts = allProducts.filter((product) => {
        const nameMatch = product.name.toLowerCase().includes(lowerQuery)
        const categoryMatch = product.category.toLowerCase().includes(lowerQuery)
        return nameMatch || categoryMatch
      })

      // Get unique product names for suggestions
      const uniqueProducts = new Map<string, string>()
      matchedProducts.forEach((p) => {
        if (!uniqueProducts.has(p.name)) {
          uniqueProducts.set(p.name, p.category)
        }
      })

      // Add product suggestions (limit to 3)
      Array.from(uniqueProducts.entries())
        .slice(0, 3)
        .forEach(([name, category]) => {
          productMatches.push({
            type: 'product',
            value: name,
            label: `${name} (${category})`
          })
        })

      // Get unique categories that match
      const uniqueCategories = new Set<string>()
      matchedProducts.forEach((p) => {
        if (p.category.toLowerCase().includes(lowerQuery)) {
          uniqueCategories.add(p.category)
        }
      })

      // Add category suggestions (limit to 2)
      Array.from(uniqueCategories)
        .slice(0, 2)
        .forEach((category) => {
          categoryMatches.push({
            type: 'category',
            value: category,
            label: `Shop ${category}`
          })
        })

      // Combine suggestions
      setSuggestions([...productMatches, ...categoryMatches])
    },
    [interests.searchHistory, interests.favoritedCategories, allProducts]
  )

  // Handle input change with debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      generateSuggestions(query)
      setSelectedIndex(-1)
    }, 300)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query, generateSuggestions])

  // Handle clicks outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > -1 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0) {
          const selected = suggestions[selectedIndex]
          handleSuggestionClick(selected)
        } else if (query.trim()) {
          handleSearch(query)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
    }
  }

  const handleSearch = (searchQuery: string) => {
    const trimmedQuery = searchQuery.trim()
    if (trimmedQuery) {
      addToSearchHistory(trimmedQuery)
      onSearch(trimmedQuery)
    }
    setIsOpen(false)
    setQuery('')
  }

  const handleSuggestionClick = (suggestion: {
    type: 'product' | 'search' | 'category'
    value: string
    label: string
  }) => {
    if (suggestion.type === 'product') {
      addToSearchHistory(suggestion.value)
      onSearch(suggestion.value)
    } else if (suggestion.type === 'category') {
      onSearch('', suggestion.value)
    } else {
      onSearch(suggestion.value)
    }
    setIsOpen(false)
    setQuery('')
  }

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      <div className="relative">
        {/* Search Input */}
        <div className="relative bg-final-dark-gray/50 backdrop-blur-sm border border-final-light-gray/30 rounded-lg overflow-hidden transition-all duration-300 hover:border-final-light-gray/50 focus-within:border-final-accent">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-final-light-gray/50 w-5 h-5" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => {
              setIsOpen(true)
              generateSuggestions(query)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent pl-10 pr-10 py-3 text-final-off-white placeholder-final-light-gray/50 outline-none text-sm"
          />

          {/* Clear Button */}
          {query && (
            <button
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-final-light-gray/50 hover:text-final-off-white transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      <AnimatePresence>
        {isOpen && (suggestions.length > 0 || query === '') && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 right-0 mt-2 bg-final-dark-gray/95 backdrop-blur-lg border border-final-light-gray/30 rounded-lg shadow-lg overflow-hidden z-50"
          >
            <div className="max-h-96 overflow-y-auto">
              {suggestions.length > 0 ? (
                suggestions.map((suggestion, index) => (
                  <motion.button
                    key={`${suggestion.type}-${suggestion.value}`}
                    onClick={() => handleSuggestionClick(suggestion)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                      index === selectedIndex
                        ? 'bg-final-accent/20 text-final-accent'
                        : 'text-final-off-white/70 hover:bg-final-light-gray/10 hover:text-final-off-white'
                    }`}
                  >
                    {suggestion.type === 'search' && (
                      <FiClock className="w-4 h-4 opacity-50 flex-shrink-0" />
                    )}
                    {suggestion.type === 'product' && (
                      <FiSearch className="w-4 h-4 opacity-50 flex-shrink-0" />
                    )}
                    {suggestion.type === 'category' && (
                      <FiTrendingUp className="w-4 h-4 opacity-50 flex-shrink-0" />
                    )}
                    <span className="text-sm truncate">{suggestion.label}</span>
                  </motion.button>
                ))
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-final-off-white/50 text-sm">No products found</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
