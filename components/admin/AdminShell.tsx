'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiActivity, FiCalendar, FiExternalLink, FiLogOut, FiPackage, FiShoppingBag } from 'react-icons/fi'
import { LogoMark } from '@/components/ui/LogoMark'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

const nav = [
  { name: 'Products', href: '/admin', icon: FiPackage },
  { name: 'Orders', href: '/admin/orders', icon: FiShoppingBag },
  { name: 'Drops', href: '/admin/drops', icon: FiCalendar },
  { name: 'Tracking', href: '/admin/tracking', icon: FiActivity },
]

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href))

  async function signOut() {
    setSigningOut(true)
    await createSupabaseBrowserClient().auth.signOut().catch(() => {})
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="min-h-[100dvh] bg-final-black text-final-off-white">
      <header className="material sticky top-0 z-40 border-b border-final-off-white/10 bg-final-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex items-center gap-3">
            <LogoMark size={22} />
            <span className="display text-[13px] tracking-[0.04em]">Final Heaven</span>
            <span className="rounded-md border border-final-off-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-final-muted">
              Admin
            </span>
          </Link>

          <div className="flex items-center gap-1 text-sm">
            {email && <span className="mr-2 hidden max-w-[220px] truncate text-final-muted lg:inline">{email}</span>}
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-final-muted transition-colors hover:bg-final-off-white/5 hover:text-final-off-white sm:inline-flex"
            >
              View store
              <FiExternalLink className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-final-muted transition-colors hover:bg-final-off-white/5 hover:text-final-off-white disabled:opacity-60"
            >
              <FiLogOut className="h-4 w-4" />
              {signingOut ? 'Signing out' : 'Sign out'}
            </button>
          </div>
        </div>

        <nav aria-label="Admin" className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6 lg:px-8">
          <ul className="flex gap-6">
            {nav.map(({ name, href, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? 'page' : undefined}
                  className={`relative flex items-center gap-2 whitespace-nowrap py-3 text-sm font-medium transition-colors ${
                    isActive(href) ? 'text-final-off-white' : 'text-final-muted hover:text-final-off-white'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  {name}
                  {isActive(href) && (
                    <motion.span
                      layoutId="admin-nav-active"
                      transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                      className="absolute inset-x-0 -bottom-px h-px bg-final-off-white"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main>{children}</main>
    </div>
  )
}
