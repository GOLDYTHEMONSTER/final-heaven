import type { Metadata, Viewport } from 'next'
import { Archivo } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { VercelAnalytics } from '@/components/analytics/VercelAnalytics'

// One variable family: the width axis gives the expanded display cut, normal width for body.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
})

const SITE = process.env.SITE_URL || 'https://www.finalheaven.shop'
const DESCRIPTION = 'Curated streetwear, Final Heaven originals, independent labels, jewellery and accessories, and new drops, at prices that make sense. Delivered across Nigeria.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Final Heaven · Streetwear finds, originals and drops',
  description: DESCRIPTION,
  keywords: 'streetwear, Final Heaven, Lagos, Nigeria, independent labels, accessories, jewellery, drops',
  openGraph: { siteName: 'Final Heaven', type: 'website', title: 'Final Heaven', description: DESCRIPTION, locale: 'en_NG' },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="font-sans">
        <Providers>
          {children}
        </Providers>
        <VercelAnalytics />
      </body>
    </html>
  )
}
