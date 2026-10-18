'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import { FiShoppingBag, FiMenu, FiX } from 'react-icons/fi'
import { useCart } from '@/components/providers/CartProvider'
import { LogoMark } from '@/components/ui/LogoMark'

const navItems = [
  { name: 'Shop', href: '/shop' },
  { name: 'New Drops', href: '/new-drops' },
  { name: 'Membership', href: '/membership' },
  { name: 'Track Order', href: '/track-order' },
]

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  const { itemCount } = useCart()
  const pathname = usePathname()

  // Hairline fades in once content scrolls under the bar (motion value, no re-renders).
  const { scrollY } = useScroll()
  const edgeOpacity = useTransform(scrollY, [0, 48], [0, 1])

  useEffect(() => setHasMounted(true), [])
  useEffect(() => setIsMenuOpen(false), [pathname])

  useEffect(() => {
    if (!isMenuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMenuOpen])

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`)

  return (
    <header className="material fixed inset-x-0 top-0 z-50 bg-final-black/75 backdrop-blur-xl backdrop-saturate-150">
      <motion.div
        aria-hidden="true"
        style={{ opacity: edgeOpacity }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-final-off-white/10"
      />

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="neon-hover flex items-center gap-3" aria-label="Final Heaven home">
          <LogoMark size={28} priority />
          <span className="display hidden text-[15px] tracking-[0.02em] sm:inline">Final Heaven</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`relative py-2 text-sm font-medium transition-colors duration-200 ${
                isActive(item.href) ? 'text-final-off-white' : 'text-final-muted hover:text-final-off-white'
              }`}
            >
              {item.name}
              {isActive(item.href) && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                  className="absolute inset-x-0 -bottom-px h-px bg-final-off-white"
                />
              )}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/cart"
            aria-label={hasMounted && itemCount > 0 ? `Cart, ${itemCount} items` : 'Cart'}
            className="relative grid h-10 w-10 place-items-center rounded-full text-final-off-white transition-colors hover:bg-final-off-white/10"
          >
            <FiShoppingBag className="h-5 w-5" strokeWidth={1.75} />
            <AnimatePresence>
              {hasMounted && itemCount > 0 && (
                <motion.span
                  key={itemCount}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0.3, duration: 0.35 }}
                  className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-final-ember px-1 text-[11px] font-bold tabular-nums text-final-black"
                >
                  {itemCount}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            className="grid h-10 w-10 place-items-center rounded-full text-final-off-white transition-colors hover:bg-final-off-white/10 md:hidden"
          >
            {isMenuOpen ? <FiX className="h-5 w-5" /> : <FiMenu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isMenuOpen && (
          <motion.nav
            id="mobile-nav"
            aria-label="Mobile"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="border-t border-final-off-white/10 px-4 pb-6 pt-2 md:hidden"
          >
            <ul>
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={`display block py-3 text-2xl ${
                      isActive(item.href) ? 'text-final-off-white' : 'text-final-muted'
                    }`}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
