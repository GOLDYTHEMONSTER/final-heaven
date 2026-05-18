'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiClock, FiGift, FiUsers, FiShield, FiZap, FiArrowRight, FiCheck } from 'react-icons/fi'
import { Layout } from '@/components/layout/Layout'

const membershipTiers = [
  {
    name: 'Basic',
    price: 0,
    period: 'month',
    description: 'Free access to shop',
    features: [
      'Access to regular drops',
      'Standard shipping',
      'Email updates',
      'Basic support'
    ],
    popular: false
  },
  {
    name: 'Plus Member',
    price: 29.99,
    period: 'month',
    description: 'Get priority access to new arrivals and member-only deals.',
    features: [
      '24h early access to all drops',
      'Exclusive member-only products',
      'Up to 30% off on member items',
      'Free express shipping',
      'Private Discord community',
      'Priority customer support',
      'Exclusive events access',
      'Monthly member-only drops'
    ],
    popular: true
  },
  {
    name: 'Premium Member',
    price: 79.99,
    period: 'month',
    description: 'A premium membership tier for serious buyers.',
    features: [
      'All Plus Member benefits',
      'Up to 50% off on member items',
      'Free worldwide shipping',
      'Personal shopping assistant',
      'Exclusive limited editions',
      'VIP event invitations',
      'Custom sizing consultations'
    ],
    popular: false
  }
]

const benefits = [
  {
    icon: FiClock,
    title: 'Early Access',
    description: 'Shop new drops before anyone else with exclusive early access periods.'
  },
  {
    icon: FiGift,
    title: 'Exclusive Discounts',
    description: 'Get up to 50% off on member-only items and special collections.'
  },
  {
    icon: FiUsers,
    title: 'Private Community',
    description: 'Join our private Discord server and connect with fellow members.'
  },
  {
    icon: FiShield,
    title: 'Priority Support',
    description: 'Get faster responses and dedicated support for all your needs.'
  },
  {
    icon: FiZap,
    title: 'Limited Editions',
    description: 'Access to exclusive limited edition pieces only available to members.'
  },
  {
    icon: FiZap,
    title: 'VIP Events',
    description: 'Invitations to exclusive events, pop-ups, and member-only experiences.'
  }
]

export default function MembershipPage() {
  const [selectedTier, setSelectedTier] = useState('Plus Member')
  const [isSigningUp, setIsSigningUp] = useState(false)

  const handleSignUp = (tierName: string) => {
    setIsSigningUp(true)
    // Simulate signup process
    setTimeout(() => {
      alert(`Welcome to the ${tierName} tier! You'll receive a confirmation email shortly.`)
      setIsSigningUp(false)
    }, 2000)
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-final-black via-final-gray to-final-dark-gray pt-24">
        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="flex items-center justify-center mb-6">
                <FiClock className="w-16 h-16 text-final-accent mr-4" />
                <h1 className="text-5xl md:text-6xl font-bold text-final-off-white">
                  JOIN THE <span className="gradient-text">COMMUNITY</span>
                </h1>
              </div>
              <p className="text-xl text-final-off-white/70 max-w-3xl mx-auto mb-8">
                Become a member and unlock early access to new drops, special offers, and a growing streetwear community. Connect with fellow enthusiasts and shop smarter.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Benefits Grid */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-final-gray/50 to-transparent">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-bold text-final-off-white mb-4">Member Benefits</h2>
              <p className="text-xl text-final-off-white/70 max-w-2xl mx-auto">
                Unlock exclusive perks and join the most dedicated streetwear community.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {benefits.map((benefit, index) => {
                const Icon = benefit.icon;
                return (
                  <motion.div
                    key={benefit.title}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border border-final-light-gray/30 hover:border-final-accent/50 transition-all duration-300"
                  >
                    <div className="w-16 h-16 bg-final-accent/20 rounded-full flex items-center justify-center mb-6">
                      <Icon className="w-8 h-8 text-final-accent" />
                    </div>
                    <h3 className="text-xl font-semibold text-final-off-white mb-3">{benefit.title}</h3>
                    <p className="text-final-off-white/70 leading-relaxed">{benefit.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Pricing Tiers */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-bold text-final-off-white mb-4">Choose Your Tier</h2>
              <p className="text-xl text-final-off-white/70 max-w-2xl mx-auto">
                Select the membership tier that best fits your streetwear lifestyle.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {membershipTiers.map((tier, index) => (
                <motion.div
                  key={tier.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.2 }}
                  className={`relative bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-8 border transition-all duration-300 ${
                    tier.popular 
                      ? 'border-final-accent scale-105' 
                      : 'border-final-light-gray/30 hover:border-final-accent/50'
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <span className="bg-final-accent text-final-black px-4 py-2 rounded-full text-sm font-bold">
                        MOST POPULAR
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-final-off-white mb-2">{tier.name}</h3>
                    <p className="text-final-off-white/70 mb-6">{tier.description}</p>
                    
                    <div className="mb-6">
                      {tier.price === 0 ? (
                        <span className="text-4xl font-bold text-final-off-white">Free</span>
                      ) : (
                        <div>
                          <span className="text-4xl font-bold text-final-accent">${tier.price}</span>
                          <span className="text-final-off-white/70">/{tier.period}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-4 mb-8">
                    {tier.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start space-x-3">
                        <FiCheck className="w-5 h-5 text-final-accent mt-0.5 flex-shrink-0" />
                        <span className="text-final-off-white/80">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSignUp(tier.name)}
                    disabled={isSigningUp}
                    className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center space-x-2 transition-all duration-300 ${
                      tier.popular
                        ? 'bg-final-accent text-final-black hover:shadow-lg hover:shadow-final-accent/25'
                        : 'bg-final-gray text-final-off-white hover:bg-final-accent hover:text-final-black'
                    } disabled:opacity-50`}
                  >
                    {isSigningUp ? (
                      'Processing...'
                    ) : (
                      <>
                        <span>{tier.price === 0 ? 'Get Started' : 'Join Now'}</span>
                        <FiArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </motion.button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-t from-final-gray/50 to-transparent">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-bold text-final-off-white mb-4">Frequently Asked Questions</h2>
            </motion.div>

            <div className="space-y-6">
              {[
                {
                  question: 'Can I cancel my membership anytime?',
                  answer: 'Yes, you can cancel your membership at any time. Your benefits will remain active until the end of your current billing period.'
                },
                {
                  question: 'Do I get early access to all products?',
                  answer: 'Plus Members get 24h early access, while Premium Members get 48h early access to all new drops and releases.'
                },
                {
                  question: 'Are there any hidden fees?',
                  answer: 'No hidden fees. The price you see is what you pay. All shipping costs are included in your membership.'
                },
                {
                  question: 'How do I access the Discord community?',
                  answer: 'Once you become a member, you\'ll receive an invitation link to join our exclusive Discord server within 24 hours.'
                }
              ].map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="bg-final-dark-gray/50 backdrop-blur-sm rounded-xl p-6 border border-final-light-gray/30"
                >
                  <h3 className="text-lg font-semibold text-final-off-white mb-2">{faq.question}</h3>
                  <p className="text-final-off-white/70">{faq.answer}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  )
} 