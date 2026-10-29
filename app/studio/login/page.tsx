import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Sign in - Final Heaven',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-final-black px-4 py-16">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
