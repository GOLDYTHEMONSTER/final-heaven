import Link from 'next/link'
import { Layout } from '@/components/layout/Layout'
import { BUSINESS, POLICY } from '@/lib/legal'

/**
 * How to reach us: the support email if one is set, otherwise the contact
 * form (start-ups often don't publish an email, phone or address yet).
 */
export function ContactLine({ topic }: { topic?: 'order' | 'return' | 'privacy' | 'other' }) {
  const formLink = <Link href={topic ? `/contact?topic=${topic}` : '/contact'}>our contact form</Link>
  if (!BUSINESS.email) return <>use {formLink}</>
  return (
    <>
      email <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
      {BUSINESS.phone && <>, call {BUSINESS.phone}</>}, or use {formLink}
    </>
  )
}

/** Who runs Final Heaven, using only the details that exist. */
export function BusinessIdentity() {
  return (
    <>
      Final Heaven is an independent streetwear brand based in Nigeria
      {BUSINESS.legalName && <>, operated by {BUSINESS.legalName}</>}
      {BUSINESS.registrationNumber && <>, registered with the Corporate Affairs Commission under number {BUSINESS.registrationNumber}</>}
      {BUSINESS.address && <>, at {BUSINESS.address}</>}.
    </>
  )
}

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms of Sale' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/returns', label: 'Returns & Refunds' },
  { href: '/shipping', label: 'Shipping' },
  { href: '/contact', label: 'Contact' },
]

/** Shared layout for policy pages: readable measure, effective date, sibling links. */
export function LegalPage({ title, intro, current, children }: {
  title: string
  intro?: string
  current: string
  children: React.ReactNode
}) {
  return (
    <Layout>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-28 sm:px-6">
        <nav aria-label="Policies" className="mb-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={l.href === current ? 'page' : undefined}
              className={l.href === current ? 'text-final-off-white' : 'text-final-muted hover:text-final-off-white'}>
              {l.label}
            </Link>
          ))}
        </nav>
        <h1 className="display text-4xl md:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-final-muted">Effective {POLICY.effectiveDate}</p>
        {intro && <p className="mt-6 text-lg text-final-muted">{intro}</p>}
        <div className="legal mt-10 space-y-10 leading-relaxed text-final-off-white/85">{children}</div>
      </main>
    </Layout>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-final-off-white">{title}</h2>
      <div className="space-y-3 [&_a]:underline [&_a]:underline-offset-4 [&_ul>li]:ml-5 [&_ul>li]:list-disc [&_ul]:space-y-2">{children}</div>
    </section>
  )
}
