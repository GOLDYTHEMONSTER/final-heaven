'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { FiArrowRight } from 'react-icons/fi'

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-final-black via-final-gray to-final-dark-gray" />
      
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-radial from-red-500/20 via-orange-500/15 to-transparent rounded-full blur-3xl"
          style={{
            boxShadow: '0 0 50px rgba(255, 0, 0, 0.3), 0 0 100px rgba(255, 0, 0, 0.2)',
            animation: 'rgb-glow 8s linear infinite'
          }}
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [360, 180, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-radial from-blue-500/20 via-purple-500/15 to-transparent rounded-full blur-3xl"
          style={{
            boxShadow: '0 0 60px rgba(0, 0, 255, 0.3), 0 0 120px rgba(0, 0, 255, 0.2)',
            animation: 'rgb-glow 12s linear infinite reverse'
          }}
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            rotate: [180, 360, 180],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-1/2 right-1/4 w-48 h-48 bg-gradient-radial from-green-500/20 via-yellow-500/15 to-transparent rounded-full blur-3xl"
          style={{
            boxShadow: '0 0 40px rgba(0, 255, 0, 0.3), 0 0 80px rgba(0, 255, 0, 0.2)',
            animation: 'rgb-glow 10s linear infinite'
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-6 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2 }}
          className="mx-auto flex max-w-6xl flex-col items-center text-center"
        >
          <span className="mb-6 inline-flex rounded-full border border-final-accent/50 bg-final-accent/10 px-5 py-2 text-sm uppercase tracking-[0.35em] text-final-accent">
            Streetwear. Premium drops.
          </span>

          <motion.h1
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="text-5xl md:text-7xl lg:text-8xl font-black leading-tight tracking-[-0.04em]"
          >
            <motion.span
              initial={{ opacity: 0.9, scale: 0.96 }}
              animate={{
                opacity: [0.95, 1, 0.95],
                textShadow: [
                  '0 0 18px rgba(255, 0, 145, 0.45), 0 0 40px rgba(255, 0, 145, 0.15)',
                  '0 0 18px rgba(0, 200, 255, 0.45), 0 0 40px rgba(0, 200, 255, 0.15)',
                  '0 0 18px rgba(255, 200, 0, 0.45), 0 0 40px rgba(255, 200, 0, 0.15)'
                ]
              }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              className="block text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-cyan-400 to-amber-300"
            >
              FINAL
            </motion.span>
            <span className="block mt-2 text-final-off-white">HEAVEN</span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link
              href="/shop"
              className="inline-flex items-center justify-center rounded-full bg-final-accent px-8 py-4 text-base font-semibold text-final-black shadow-[0_20px_60px_rgba(255,145,0,0.18)] transition-transform duration-300 hover:-translate-y-1"
            >
              Shop the Drop
              <FiArrowRight className="ml-3 h-5 w-5" />
            </Link>
            <Link
              href="/membership"
              className="inline-flex items-center justify-center rounded-full border border-final-off-white/20 bg-white/5 px-8 py-4 text-base font-semibold text-final-off-white transition-colors duration-300 hover:border-final-accent hover:text-final-accent"
            >
              Join the Circle
            </Link>
          </motion.div>

          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-left backdrop-blur-sm">
              <span className="block text-sm uppercase tracking-[0.35em] text-final-off-white/60">Fast restocks</span>
              <p className="mt-3 text-2xl font-bold text-final-off-white">New drops weekly</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-left backdrop-blur-sm">
              <span className="block text-sm uppercase tracking-[0.35em] text-final-off-white/60">Members only</span>
              <p className="mt-3 text-2xl font-bold text-final-off-white">24h early access</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-left backdrop-blur-sm">
              <span className="block text-sm uppercase tracking-[0.35em] text-final-off-white/60">Street cred</span>
              <p className="mt-3 text-2xl font-bold text-final-off-white">Curated, limited runs</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
} 