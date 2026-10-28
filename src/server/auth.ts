import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireUserId } from '#/auth/session'
import {
  getUserProfile,
  updateUserProfile,
} from '#/services/user-profile'

export const getProfile = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const profile = await getUserProfile(userId)
    return {
      displayName: profile.displayName,
      timezone: profile.timezone,
      roleLabel: profile.roleLabel,
      onboardingCompletedAt:
        profile.onboardingCompletedAt?.toISOString() ?? null,
    }
  },
)

export const saveOnboarding = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      displayName: z.string().min(1).max(120),
      roleLabel: z.string().max(120).optional(),
      timezone: z.string().min(1).max(64),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const profile = await updateUserProfile(userId, {
      displayName: data.displayName,
      roleLabel: data.roleLabel || null,
      timezone: data.timezone,
      completeOnboarding: true,
    })
    return {
      displayName: profile.displayName,
      timezone: profile.timezone,
      roleLabel: profile.roleLabel,
      onboardingCompletedAt:
        profile.onboardingCompletedAt?.toISOString() ?? null,
    }
  })
