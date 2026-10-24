'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiActivity, FiCalendar, FiExternalLink, FiLogOut, FiMail, FiPackage, FiShoppingBag, FiSliders, FiTag, FiUsers } from 'react-icons/fi'
import { LogoMark } from '@/components/ui/LogoMark'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { ActivityBell, ActivityProvider, LiveStatus, NavBadge, type Section } from '@/components/admin/activity'

// Each section is shown only to staff holding its permission. Hiding is a
// convenience: the API and RLS enforce the same permissions.
const nav: { name: string; href: string; icon: typeof FiActivity; permission: string; section?: Section }[] = [
  { name: 'Analytics', href: '/admin/analytics', icon: FiActivity, permission: 'analytics.read' },
  { name: 'Products', href: '/admin', icon: FiPackage, permission: 'products.read', section: 'products' },
  { name: 'Orders', href: '/admin/orders', icon: FiShoppingBag, permission: 'orders.read', section: 'orders' },
  { name: 'Drops', href: '/admin/drops', icon: FiCalendar, permission: 'products.read' },
  { name: 'Promo codes', href: '/admin/promos', icon: FiTag, permission: 'products.read' },
  { name: 'Customers', href: '/admin/customers', icon: FiUsers, permission: 'customers.read', section: 'customers' },
  { name: 'Messages', href: '/admin/messages', icon: FiMail, permission: 'customers.read', section: 'messages' },
  { name: 'Store', href: '/admin/store', icon: FiSliders, permission: 'settings.manage' },
]

function useSignOut() {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  async function signOut() {
    setSigningOut(true)
    await createSupabaseBrowserClient().auth.signOut().catch(() => {})
    router.replace('/login')
    router.refresh()
  }
  return { signingOut, signOut }
}

/** Signed in, but not staff of any active business. */
export function NoAccess({ email }: { email: string }) {
  const { signingOut, signOut } = useSignOut()
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-final-black px-4 text-final-off-white">
      <div className="max-w-sm text-center">
        <LogoMark size={40} />
        <h1 className="display mt-6 text-2xl">No admin access</h1>
        <p className="mt-3 text-sm text-final-muted">
          {email ? <>{email} isn’t</> : <>This account isn’t</>} a staff member of any store. Ask the store owner to invite you.
        </p>
        <button type="button" onClick={signOut} disabled={signingOut} className="btn-secondary mt-6">
          {signingOut ? 'Signing out' : 'Sign out'}
        </button>
      </div>
    </main>
  )
}

export function AdminShell({
  email,
  tenantId,
  tenantName,
  permissions,
  children,
}: {
  email: string
  tenantId: string
  tenantName: string
  permissions: string[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { signingOut, signOut } = useSignOut()
  const visibleNav = nav.filter((item) => permissions.includes(item.permission))

  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href))

  return (
    <ActivityProvider tenantId={tenantId}>
    <div className="min-h-[100dvh] bg-final-black text-final-off-white">
      <header className="material sticky top-0 z-40 border-b border-final-off-white/10 bg-final-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex min-w-0 items-center gap-3">
            <LogoMark size={22} />
            <span className="display max-w-[40vw] truncate whitespace-nowrap text-[13px] tracking-[0.04em]">{tenantName}</span>
            <span className="rounded-md border border-final-off-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-final-muted">
              Admin
            </span>
          </Link>

          <div className="flex items-center gap-1 text-sm">
            <LiveStatus />
            <ActivityBell />
            {email && <span className="mx-2 hidden max-w-[220px] truncate text-final-muted lg:inline">{email}</span>}
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
              aria-label="Sign out"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-final-muted transition-colors hover:bg-final-off-white/5 hover:text-final-off-white disabled:opacity-60"
            >
              <FiLogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{signingOut ? 'Signing out' : 'Sign out'}</span>
            </button>
          </div>
        </div>

        <nav aria-label="Admin" className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6 lg:px-8">
          <ul className="flex gap-6">
            {visibleNav.map(({ name, href, icon: Icon, section }) => (
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
                  {section && <NavBadge section={section} />}
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
    </ActivityProvider>
  )
}
