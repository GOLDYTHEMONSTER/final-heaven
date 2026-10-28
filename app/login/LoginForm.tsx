'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiArrowLeft } from 'react-icons/fi'
import { LogoMark } from '@/components/ui/LogoMark'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

/** Only same-site admin paths, so ?next= can't be used to redirect somewhere else. */
function safeNext(value: string | null) {
  return value && /^\/admin(\/[A-Za-z0-9/_-]*)?$/.test(value) ? value : '/admin'
}

// Sign-in is two steps: password, then a 6-digit code from an authenticator app.
// The first time, the second step sets the app up from a QR code. Admin (and
// staff access in the database) needs both steps (aal2).
type Step =
  | { kind: 'password' }
  | { kind: 'code'; factorId: string }
  | { kind: 'enrol'; factorId: string; qr: string; secret: string }

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>({ kind: 'password' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  // Already past the password (sent back here by the middleware): go to the code.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) secondStep().catch(() => setStep({ kind: 'password' }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signOut(message = '') {
    await createSupabaseBrowserClient().auth.signOut()
    setStep({ kind: 'password' })
    setCode('')
    setError(message)
  }

  /** After the password: ask for the code, or set the app up the first time. */
  async function secondStep() {
    const supabase = createSupabaseBrowserClient()
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (level?.currentLevel === 'aal2') return finish()

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) throw listError
    const verified = factors.totp[0]
    if (verified) {
      setStep({ kind: 'code', factorId: verified.id })
      return
    }
    // A setup that was started but never confirmed: start it again.
    for (const f of factors.all.filter((f) => f.status === 'unverified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data: enrolled, error: enrolError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    })
    if (enrolError || !enrolled) throw enrolError ?? new Error('enrol failed')
    setStep({ kind: 'enrol', factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret })
  }

  /** Both steps done: staff access comes from memberships in the database. */
  async function finish() {
    const supabase = createSupabaseBrowserClient()
    const [{ data: access, error: accessError }, { data: platform }] = await Promise.all([
      supabase.rpc('my_tenant_access'),
      supabase.rpc('am_platform_admin'),
    ])
    if (accessError) {
      // e.g. 404 when the database hasn't had the Phase 1 migration yet.
      await signOut('Admin access couldn’t be checked: the database isn’t set up for staff accounts yet. Contact the site owner.')
      return
    }
    if (!access?.length && platform !== true) {
      await signOut('This account isn’t a staff member of any store.')
      return
    }
    router.replace(safeNext(searchParams.get('next')))
    router.refresh()
  }

  async function onPassword(event: React.FormEvent<HTMLFormElement>) {
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
      setPassword('')
      await secondStep()
    } catch {
      setError('Couldn’t reach the sign-in service. Try again in a moment.')
    } finally {
      setPending(false)
    }
  }

  async function onCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step.kind === 'password') return
    setError('')
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }

    setPending(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: digits })
      if (verifyError) {
        setError('That code didn’t work. Codes change every 30 seconds: try the current one.')
        return
      }
      await finish()
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
        <p className="mt-2 text-sm text-final-muted">
          {step.kind === 'password'
            ? 'Sign in to manage products, drops and orders.'
            : step.kind === 'code'
              ? 'Enter the code from your authenticator app.'
              : 'Set up two-step sign-in. You’ll need it every time you sign in.'}
        </p>
      </div>

      {step.kind === 'password' ? (
        <form onSubmit={onPassword} noValidate className="space-y-5 rounded-2xl border border-final-off-white/10 bg-final-gray p-6">
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
      ) : (
        <form onSubmit={onCode} noValidate className="space-y-5 rounded-2xl border border-final-off-white/10 bg-final-gray p-6">
          {step.kind === 'enrol' && (
            <div className="space-y-3 text-sm text-final-off-white/80">
              <p>
                1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and scan this code.
              </p>
              <div className="mx-auto w-fit rounded-lg bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- an SVG data URL from Supabase, not a file */}
                <img src={step.qr} alt="QR code for your authenticator app" width={176} height={176} />
              </div>
              <p className="text-xs text-final-muted">
                Can’t scan? Enter this key instead:{' '}
                <span className="select-all break-all font-mono text-final-off-white">{step.secret}</span>
              </p>
              <p>2. Type the 6-digit code the app shows.</p>
            </div>
          )}
          <div>
            <label htmlFor="login-code" className="mb-2 block text-sm font-medium text-final-off-white/80">
              6-digit code
            </label>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={!!error}
              className={`${inputClass} text-center font-mono text-lg tracking-[0.3em]`}
            />
          </div>

          <p role="alert" className="min-h-[1.25rem] text-sm text-final-ember">
            {error}
          </p>

          <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
            {pending ? 'Checking' : step.kind === 'enrol' ? 'Turn on and continue' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full text-center text-sm text-final-muted transition-colors hover:text-final-off-white"
          >
            Use a different account
          </button>
        </form>
      )}

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
