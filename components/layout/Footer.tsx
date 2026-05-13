'use client'

import Link from 'next/link'
import { FiInstagram, FiTwitter, FiFacebook } from 'react-icons/fi'
import { motion } from 'framer-motion'

export function Footer() {
  return (
    <footer className="relative bg-gradient-to-t from-final-gray to-final-black border-t border-final-light-gray/30 overflow-hidden">
      {/* Background RGB glow elements */}
      <div className="absolute inset-0">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 90, 180],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-1/4 left-1/4 w-48 h-48 bg-gradient-radial from-red-500/15 via-orange-500/10 to-transparent rounded-full blur-3xl"
          style={{
            boxShadow: '0 0 40px rgba(255, 0, 0, 0.2), 0 0 80px rgba(255, 0, 0, 0.1)',
            animation: 'rgb-glow 10s linear infinite'
          }}
        />
        <motion.div
          animate={{
            scale: [1.1, 1, 1.1],
            rotate: [180, 270, 360],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-gradient-radial from-blue-500/15 via-purple-500/10 to-transparent rounded-full blur-3xl"
          style={{
            boxShadow: '0 0 50px rgba(0, 0, 255, 0.2), 0 0 100px rgba(0, 0, 255, 0.1)',
            animation: 'rgb-glow 14s linear infinite reverse'
          }}
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [90, 180, 270],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-1/2 right-1/3 w-32 h-32 bg-gradient-radial from-green-500/15 via-yellow-500/10 to-transparent rounded-full blur-3xl"
          style={{
            boxShadow: '0 0 30px rgba(0, 255, 0, 0.2), 0 0 60px rgba(0, 255, 0, 0.1)',
            animation: 'rgb-glow 12s linear infinite'
          }}
        />
      </div>

      {/* Footer content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-2xl font-bold gradient-text mb-4 neon-logo">FINAL HEAVEN</h3>
            <p className="text-final-off-white/70 mb-4 max-w-md">
              Join the cult. Exclusive streetwear for the chosen ones. 
              Early access, member-only drops, and the finest urban fashion.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-final-off-white hover:text-final-accent transition-colors hover:neon-text">
                <FiInstagram className="w-6 h-6" />
              </a>
              <a href="#" className="text-final-off-white hover:text-final-accent transition-colors hover:neon-text">
                <FiTwitter className="w-6 h-6" />
              </a>
              <a href="#" className="text-final-off-white hover:text-final-accent transition-colors hover:neon-text">
                <FiFacebook className="w-6 h-6" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold text-final-off-white mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/shop" className="text-final-off-white/70 hover:text-final-accent transition-colors">
                  Shop All
                </Link>
              </li>
              <li>
                <Link href="/new-drops" className="text-final-off-white/70 hover:text-final-accent transition-colors">
                  New Drops
                </Link>
              </li>
              <li>
                <Link href="/membership" className="text-final-off-white/70 hover:text-final-accent transition-colors">
                  Membership
                </Link>
              </li>
              <li>
                <Link href="/track-order" className="text-final-off-white/70 hover:text-final-accent transition-colors">
                  Track Order
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-lg font-semibold text-final-off-white mb-4">Support</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/contact" className="text-final-off-white/70 hover:text-final-accent transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/shipping" className="text-final-off-white/70 hover:text-final-accent transition-colors">
                  Shipping Info
                </Link>
              </li>
              <li>
                <Link href="/returns" className="text-final-off-white/70 hover:text-final-accent transition-colors">
                  Returns
                </Link>
              </li>
              <li>
                <Link href="/size-guide" className="text-final-off-white/70 hover:text-final-accent transition-colors">
                  Size Guide
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-final-light-gray/30 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-final-off-white/50 text-sm">
            © 2024 Final Heaven. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <Link href="/privacy" className="text-final-off-white/50 hover:text-final-accent transition-colors text-sm">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-final-off-white/50 hover:text-final-accent transition-colors text-sm">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
} 