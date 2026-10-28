import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { fetchAuthBootstrap } from '#/auth/session-fn'
import { AuthShell } from '#/components/AuthShell'
import { getProfile, saveOnboarding } from '#/server/auth'

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

type Step = 'welcome' | 'profile' | 'timezone'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async () => {
    const bootstrap = await fetchAuthBootstrap()
    if (!bootstrap.session) {
      throw redirect({ to: '/signup' })
    }
    if (bootstrap.onboardingComplete) {
      throw redirect({ to: '/' })
    }
    return bootstrap
  },
  loader: async () => {
    try {
      return await getProfile()
    } catch {
      return {
        displayName: null as string | null,
        timezone: 'UTC',
        roleLabel: null as string | null,
        onboardingCompletedAt: null as string | null,
      }
    }
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const profile = Route.useLoaderData()
  const [step, setStep] = useState<Step>('welcome')
  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const [roleLabel, setRoleLabel] = useState(profile.roleLabel || '')
  const [timezone, setTimezone] = useState(profile.timezone || guessTimezone())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const zones = useMemo(() => {
    const set = new Set(TIMEZONES)
    if (timezone) set.add(timezone)
    return [...set].sort()
  }, [timezone])

  const finish = async () => {
    setPending(true)
    setError(null)
    try {
      await saveOnboarding({
        data: {
          displayName: displayName.trim() || 'You',
          roleLabel: roleLabel.trim() || undefined,
          timezone,
        },
      })
      await navigate({ to: '/connections/add' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile')
      setPending(false)
    }
  }

  if (step === 'welcome') {
    return (
      <AuthShell
        title="Connect your inbox"
        subtitle="We classify what matters, track commitments, and keep open loops from slipping."
      >
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => setStep('profile')}
        >
          Get started
        </button>
        <p className="mt-4 text-center text-xs text-[var(--color-muted)]">
          Step 1 of 3 · Welcome
        </p>
      </AuthShell>
    )
  }

  if (step === 'profile') {
    return (
      <AuthShell
        title="A little about you"
        subtitle="Used in drafts and morning brief — you can change this later."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setStep('timezone')
          }}
        >
          <label className="auth-field">
            <span>Display name</span>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ashwin"
            />
          </label>
          <label className="auth-field">
            <span>Role (optional)</span>
            <input
              type="text"
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="Founder, PM, engineer…"
            />
          </label>
          <button type="submit" className="btn-primary w-full">
            Continue
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-[var(--color-muted)]">
          Step 2 of 3 · Profile
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Your timezone"
      subtitle="Commitment due dates and morning brief use this."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void finish()
        }}
      >
        <label className="auth-field">
          <span>Timezone</span>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            required
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="text-sm text-[var(--color-urgent)]">{error}</p>
        ) : null}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? 'Saving…' : 'Connect an inbox'}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-[var(--color-muted)]">
        Step 3 of 3 · Timezone
      </p>
    </AuthShell>
  )
}

function guessTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
