import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { authClient } from '#/auth/client'
import { fetchAuthBootstrap } from '#/auth/session-fn'
import {
  AuthDivider,
  AuthLink,
  AuthShell,
  SocialAuthButtons,
} from '#/components/AuthShell'

const searchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const bootstrap = await fetchAuthBootstrap()
    if (bootstrap.session) {
      throw redirect({
        to: bootstrap.onboardingComplete ? '/' : '/onboarding',
      })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect: redirectTo } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState<'google' | 'microsoft' | 'email' | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  const afterAuth = async () => {
    const bootstrap = await fetchAuthBootstrap()
    if (!bootstrap.onboardingComplete) {
      await navigate({ to: '/onboarding' })
      return
    }
    if (redirectTo?.startsWith('/') && !redirectTo.startsWith('//')) {
      window.location.href = redirectTo
      return
    }
    await navigate({ to: '/' })
  }

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending('email')
    setError(null)
    const { error: err } = await authClient.signIn.email({ email, password })
    if (err) {
      setError(err.message || 'Could not sign in')
      setPending(null)
      return
    }
    await afterAuth()
  }

  const social = async (provider: 'google' | 'microsoft') => {
    setPending(provider)
    setError(null)
    const { error: err } = await authClient.signIn.social({
      provider,
      callbackURL: redirectTo?.startsWith('/') ? redirectTo : '/',
    })
    if (err) {
      setError(err.message || `Could not continue with ${provider}`)
      setPending(null)
    }
  }

  return (
    <AuthShell
      title={'Welcome back.\nNothing slipped.'}
      subtitle="Continue with Google or Microsoft, or use email."
      footer={
        <>
          New here? <AuthLink to="/signup">Create account</AuthLink>
        </>
      }
    >
      <SocialAuthButtons
        pending={pending}
        onGoogle={() => void social('google')}
        onMicrosoft={() => void social('microsoft')}
      />
      <AuthDivider />
      <form className="flex flex-col gap-3" onSubmit={(e) => void onEmail(e)}>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p className="text-sm text-[var(--color-urgent)]">{error}</p>
        ) : null}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={pending !== null}
        >
          {pending === 'email' ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </AuthShell>
  )
}
