import Link from 'next/link'
import { Layout } from '@/components/layout/Layout'
import { BUSINESS, POLICY } from '@/lib/legal'

/** A business detail, or a visible marker that it still has to be filled in (lib/legal.ts). */
export function Detail({ value, label }: { value: string | null; label: string }) {
  if (value) return <>{value}</>
  return (
    <span className="rounded border border-dashed border-final-ember/60 px-1 text-final-ember" title="Set this in lib/legal.ts">
      [{label} to be added]
    </span>
  )
}

export function ContactLine() {
  return (
    <>
      email <Detail value={BUSINESS.email} label="support email" />
      {BUSINESS.phone && <>, or call {BUSINESS.phone}</>}
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
