'use client'
import { ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-final-black text-final-off-white">
      <Header />
      <div className="flex-1">
        {children}
      </div>
      <Footer />
    </div>
  )
} 