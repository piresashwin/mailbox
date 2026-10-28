import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { authClient } from '#/auth/client'
import { fetchAuthBootstrap } from '#/auth/session-fn'
import {
  AuthDivider,
  AuthLink,
  AuthShell,
  SocialAuthButtons,
} from '#/components/AuthShell'

export const Route = createFileRoute('/signup')({
  beforeLoad: async () => {
    const bootstrap = await fetchAuthBootstrap()
    if (bootstrap.session) {
      throw redirect({
        to: bootstrap.onboardingComplete ? '/' : '/onboarding',
      })
    }
  },
  component: SignupPage,
})

function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState<'google' | 'microsoft' | 'email' | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  const afterAuth = async () => {
    await navigate({ to: '/onboarding' })
  }

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending('email')
    setError(null)
    const { error: err } = await authClient.signUp.email({
      name: name.trim() || email.split('@')[0] || 'Mailbox',
      email,
      password,
    })
    if (err) {
      setError(err.message || 'Could not create account')
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
      callbackURL: '/onboarding',
    })
    if (err) {
      setError(err.message || `Could not continue with ${provider}`)
      setPending(null)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Connect your inbox. We classify what matters, track commitments, and keep open loops from slipping."
      footer={
        <>
          Already have an account? <AuthLink to="/login">Log in</AuthLink>
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
          <span>Name</span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
          />
        </label>
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
            autoComplete="new-password"
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
          {pending === 'email' ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}
