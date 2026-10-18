'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiArrowLeft } from 'react-icons/fi'
import { LogoMark } from '@/components/ui/LogoMark'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

/** Only same-site admin paths, so ?next= can't be used to redirect somewhere else. */
function safeNext(value: string | null) {
  return value && /^\/admin(\/[A-Za-z0-9/_-]*)?$/.test(value) ? value : '/admin'
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }

    setPending(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError || !data.session) {
        // Same message for unknown email and wrong password.
        setError('That email and password don’t match an admin account.')
        return
      }
      // Staff access comes from memberships in the database, not from the token.
      const [{ data: access, error: accessError }, { data: platform }] = await Promise.all([
        supabase.rpc('my_tenant_access'),
        supabase.rpc('am_platform_admin'),
      ])
      if (accessError) {
        // e.g. 404 when the database hasn't had the Phase 1 migration yet.
        await supabase.auth.signOut()
        setError('Admin access couldn’t be checked: the database isn’t set up for staff accounts yet. Contact the site owner.')
        return
      }
      if (!access?.length && platform !== true) {
        await supabase.auth.signOut()
        setError('This account isn’t a staff member of any store.')
        return
      }
      router.replace(safeNext(searchParams.get('next')))
      router.refresh()
    } catch {
      setError('Couldn’t reach the sign-in service. Try again in a moment.')
    } finally {
      setPending(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-final-off-white/15 bg-final-black px-4 py-3 text-final-off-white placeholder:text-final-muted transition-colors focus:border-final-off-white/60 focus:outline-none'

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <LogoMark size={44} priority />
        <h1 className="display mt-6 text-3xl">Admin</h1>
        <p className="mt-2 text-sm text-final-muted">Sign in to manage products, drops and orders.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5 rounded-2xl border border-final-off-white/10 bg-final-gray p-6">
        <div>
          <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-final-off-white/80">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-final-off-white/80">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            className={inputClass}
          />
        </div>

        <p role="alert" className="min-h-[1.25rem] text-sm text-final-ember">
          {error}
        </p>

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
          {pending ? 'Signing in' : 'Sign in'}
        </button>
      </form>

      <Link
        href="/"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 text-sm text-final-muted transition-colors hover:text-final-off-white"
      >
        <FiArrowLeft className="h-4 w-4" />
        Back to the store
      </Link>
    </div>
  )
}
