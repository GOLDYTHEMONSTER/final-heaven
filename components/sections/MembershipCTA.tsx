'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { FiArrowRight, FiUsers, FiClock, FiGift } from 'react-icons/fi'
import { AiOutlineCrown } from 'react-icons/ai'

export function MembershipCTA() {
  const benefits = [
    {
      icon: FiClock,
      title: '24h Early Access',
      description: 'Shop new drops before anyone else'
    },
    {
      icon: FiGift,
      title: 'Exclusive Discounts',
      description: 'Up to 30% off on member-only items'
    },
    {
      icon: FiUsers,
      title: 'Private Community',
      description: 'Join our exclusive Discord server'
    }
  ]

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-final-black via-final-gray to-final-dark-gray">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-final-off-white mb-6">
            JOIN THE <span className="gradient-text">COMMUNITY</span>
          </h2>
          <p className="text-xl text-final-off-white/70 max-w-3xl mx-auto">
            Become a member and unlock early access to limited drops, special offers, and a growing streetwear community.
          </p>
        </motion.div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="text-center group"
              >
                <div className="w-16 h-16 bg-final-accent/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-final-accent transition-colors duration-300">
                  <Icon className="w-8 h-8 text-final-accent group-hover:text-final-black transition-colors" />
                </div>
                <h3 className="text-xl font-semibold text-final-off-white mb-2">
                  {benefit.title}
                </h3>
                <p className="text-final-off-white/70">
                  {benefit.description}
                </p>
              </motion.div>
            )
          })}
        </div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <div className="bg-gradient-glass rounded-2xl p-8 md:p-12 border border-final-light-gray/30 backdrop-blur-sm">
            <div className="flex items-center justify-center mb-6">
              <AiOutlineCrown className="w-12 h-12 text-final-accent mr-4" />
              <h3 className="text-3xl font-bold text-final-off-white">
                MEMBERSHIP
              </h3>
            </div>
            <p className="text-xl text-final-off-white/70 mb-8 max-w-2xl mx-auto">
              Get exclusive access to limited drops, early releases, and member-only products.
              Join thousands of streetwear enthusiasts in the Final Heaven community.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex rounded-lg"
            >
              <Link
                href="/membership"
                className="bg-final-accent text-final-black px-8 py-4 rounded-lg font-bold text-lg flex items-center space-x-2 hover:shadow-lg hover:shadow-final-accent/25 transition-all duration-300"
              >
                <span>BECOME A MEMBER</span>
                <FiArrowRight className="w-5 h-5" />
              </Link>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex rounded-lg"
            >
              <Link
                href="/shop"
                className="border-2 border-final-accent text-final-accent px-8 py-4 rounded-lg font-bold text-lg hover:bg-final-accent hover:text-final-black transition-all duration-300"
              >
                SHOP NOW
              </Link>
            </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
} 