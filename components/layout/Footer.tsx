'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FiInstagram, FiTwitter, FiFacebook } from 'react-icons/fi'
import { LogoMark } from '@/components/ui/LogoMark'

// Add the real profile URLs here; an icon only renders once its URL is set.
const socials = [
  { name: 'Instagram', href: '', icon: FiInstagram },
  { name: 'Twitter', href: '', icon: FiTwitter },
  { name: 'Facebook', href: '', icon: FiFacebook },
].filter((s) => s.href)

const columns = [
  {
    title: 'Shop',
    links: [
      { name: 'Shop All', href: '/shop' },
      { name: 'New Drops', href: '/new-drops' },
      { name: 'Membership', href: '/membership' },
      { name: 'Track Order', href: '/track-order' },
    ],
  },
  {
    title: 'Support',
    links: [
      { name: 'Contact Us', href: '/contact' },
      { name: 'Shipping Info', href: '/shipping' },
      { name: 'Returns', href: '/returns' },
      { name: 'Size Guide', href: '/size-guide' },
    ],
  },
]

export function Footer() {
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [newsletterMessage, setNewsletterMessage] = useState('')

  const handleNewsletterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newsletterEmail.trim()) {
      setNewsletterStatus('error')
      setNewsletterMessage('Enter a valid email to subscribe.')
      return
    }

    setNewsletterStatus('loading')
    setNewsletterMessage('')

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsletterEmail.trim() }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setNewsletterStatus('error')
        setNewsletterMessage(data.error || 'Subscription failed. Please try again.')
        return
      }

      setNewsletterStatus('success')
      setNewsletterMessage(data.message || 'Subscribed successfully!')
      setNewsletterEmail('')
    } catch {
      setNewsletterStatus('error')
      setNewsletterMessage('Subscription failed. Please try again.')
    }
  }

  return (
    <footer className="border-t border-final-off-white/10">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-12">
          <div className="col-span-2 md:col-span-4">
            <Link href="/" className="inline-flex items-center gap-3" aria-label="Final Heaven home">
              <LogoMark size={32} />
              <span className="display text-lg tracking-[0.02em]">Final Heaven</span>
            </Link>
            <p className="mt-5 max-w-[36ch] text-sm leading-relaxed text-final-muted">
              Discover premium streetwear and lifestyle goods with a modern edge.
              Early access, special drops, and the best in urban fashion.
            </p>
            {socials.length > 0 && (
              <div className="mt-6 flex gap-2">
                {socials.map(({ name, href, icon: Icon }) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={name}
                    className="grid h-10 w-10 place-items-center rounded-full border border-final-off-white/15 text-final-muted transition-colors hover:border-final-off-white/40 hover:text-final-off-white"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title} className="md:col-span-2">
              <h4 className="text-sm font-semibold">{column.title}</h4>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-final-muted transition-colors hover:text-final-off-white">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="col-span-2 md:col-span-4">
            <h4 className="text-sm font-semibold">Newsletter</h4>
            <p className="mt-4 text-sm text-final-muted">
              Get drop alerts, restock notices, and exclusive updates straight to your inbox.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="mt-5" noValidate>
              <label htmlFor="newsletter-email" className="mb-2 block text-xs font-medium text-final-off-white/80">
                Email address
              </label>
              <div className="flex gap-2">
                <input
                  id="newsletter-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  aria-invalid={newsletterStatus === 'error'}
                  aria-describedby={newsletterMessage ? 'newsletter-message' : undefined}
                  className="min-w-0 flex-1 rounded-lg border border-final-off-white/15 bg-final-gray px-4 py-3 text-sm text-final-off-white placeholder:text-final-muted/70 transition-colors focus:border-final-off-white/50 focus:outline-none"
                  placeholder="you@example.com"
                />
                <button type="submit" disabled={newsletterStatus === 'loading'} className="btn-primary px-5 disabled:opacity-60">
                  {newsletterStatus === 'loading' ? 'Joining' : 'Subscribe'}
                </button>
              </div>
              <p
                id="newsletter-message"
                role="status"
                className={`mt-3 min-h-[1.25rem] text-sm ${newsletterStatus === 'success' ? 'text-final-off-white' : 'text-final-ember'}`}
              >
                {newsletterMessage}
              </p>
            </form>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-final-off-white/10 pt-8 text-xs text-final-muted md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Final Heaven. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition-colors hover:text-final-off-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-final-off-white">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
