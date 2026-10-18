import type { Metadata, Viewport } from 'next'
import { Archivo } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

// One variable family: the width axis gives the expanded display cut, normal width for body.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
})

export const metadata: Metadata = {
  title: 'Final Heaven - Urban Streetwear',
  description: 'Shop premium urban streetwear, shoes, accessories, and lifestyle goods with effortless style.',
  keywords: 'streetwear, urban fashion, shoes, accessories, vapes, lifestyle',
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
      </body>
    </html>
  )
}
