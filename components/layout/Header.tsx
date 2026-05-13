'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiShoppingCart, FiMenu, FiX, FiUser } from 'react-icons/fi'
import { useCart } from '@/components/providers/CartProvider'

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { itemCount } = useCart()

  const navItems = [
    { name: 'Shop', href: '/shop' },
    { name: 'New Drops', href: '/new-drops' },
    { name: 'Membership', href: '/membership' },
    { name: 'Track Order', href: '/track-order' },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-final-black/95 via-final-black/90 to-final-black/80 backdrop-blur-md border-b border-final-light-gray/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="text-2xl font-bold gradient-text italic tracking-wider lowercase font-serif"
            >
              final heaven
            </motion.div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-final-off-white hover:text-final-accent transition-colors duration-200 font-medium"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Right side icons */}
          <div className="flex items-center space-x-4">
            <Link href="/account" className="hidden md:block">
              <FiUser className="w-6 h-6 text-final-off-white hover:text-final-accent transition-colors" />
            </Link>
            
            <Link href="/cart" className="relative">
              <FiShoppingCart className="w-6 h-6 text-final-off-white hover:text-final-accent transition-colors" />
              {itemCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 bg-final-accent text-final-black text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold"
                >
                  {itemCount}
                </motion.span>
              )}
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden text-final-off-white hover:text-final-accent transition-colors"
            >
              {isMenuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden py-4 border-t border-final-light-gray/30 bg-gradient-to-b from-final-black/95 to-final-black/90"
          >
            <nav className="flex flex-col space-y-4">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="text-final-off-white hover:text-final-accent transition-colors duration-200 font-medium"
                >
                  {item.name}
                </Link>
              ))}
              <Link
                href="/account"
                onClick={() => setIsMenuOpen(false)}
                className="text-final-off-white hover:text-final-accent transition-colors duration-200 font-medium"
              >
                Account
              </Link>
            </nav>
          </motion.div>
        )}
      </div>
    </header>
  )
} 