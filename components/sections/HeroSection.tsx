'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { FiArrowRight } from 'react-icons/fi'

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-final-black via-final-gray to-final-dark-gray" />
      
      {/* Animated background elements */}
      <div className="absolute inset-0">
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
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto"
        >
          {/* Main heading */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="text-6xl md:text-8xl lg:text-9xl font-black mb-6"
          >
            <span className="gradient-text neon-logo">FINAL</span>
            <br />
            <span className="text-final-off-white">HEAVEN</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-final-off-white/80 mb-8 max-w-2xl mx-auto"
          >
            Join the cult. Exclusive streetwear for the chosen ones.
            <br />
            <span className="text-final-accent font-semibold">Early access. Member-only drops.</span>
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex rounded-lg"
            >
              <Link
                href="/shop"
                className="bg-final-accent text-final-black px-8 py-4 rounded-lg font-bold text-lg flex items-center space-x-2 hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
              >
                <span>SHOP NOW</span>
                <FiArrowRight className="w-5 h-5" />
              </Link>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex rounded-lg"
            >
              <Link
                href="/membership"
                className="border-2 border-final-accent text-final-accent px-8 py-4 rounded-lg font-bold text-lg hover:bg-final-accent hover:text-final-black transition-all duration-300"
              >
                JOIN THE CULT
              </Link>
            </motion.div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1 }}
            className="mt-10 flex justify-center"
          >
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-6 h-10 border-2 border-final-accent rounded-full flex justify-center"
            >
              <motion.div
                animate={{ y: [0, 12, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-1 h-3 bg-final-accent rounded-full mt-2"
              />
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
} 