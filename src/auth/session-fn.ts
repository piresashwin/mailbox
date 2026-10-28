import { createServerFn } from '@tanstack/react-start'

import { getSession } from './session'
import { getUserProfile, isOnboardingComplete } from '#/services/user-profile'

export const fetchSession = createServerFn({ method: 'GET' }).handler(
  async () => getSession(),
)

export const fetchAuthBootstrap = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()
    if (!session) return { session: null, onboardingComplete: false }
    const profile = await getUserProfile(session.user.id)
    return {
      session,
      profile: {
        displayName: profile.displayName,
        timezone: profile.timezone,
        roleLabel: profile.roleLabel,
        onboardingCompletedAt:
          profile.onboardingCompletedAt?.toISOString() ?? null,
      },
      onboardingComplete: Boolean(profile.onboardingCompletedAt),
    }
  },
)

export const fetchOnboardingStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()
    if (!session) return { authenticated: false, complete: false }
    return {
      authenticated: true,
      complete: await isOnboardingComplete(session.user.id),
    }
  },
)
