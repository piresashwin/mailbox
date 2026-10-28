import { eq } from 'drizzle-orm'

import { db } from '#/db'
import { userProfiles } from '#/db/schema'

export async function ensureUserProfile(
  userId: string,
  seed?: { displayName?: string | null; timezone?: string },
) {
  const existing = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
  })
  if (existing) return existing

  const [row] = await db
    .insert(userProfiles)
    .values({
      userId,
      displayName: seed?.displayName ?? null,
      timezone: seed?.timezone || 'UTC',
    })
    .returning()
  return row
}

export async function getUserProfile(userId: string) {
  return (
    (await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    })) ?? (await ensureUserProfile(userId))
  )
}

export async function updateUserProfile(
  userId: string,
  input: {
    displayName?: string | null
    timezone?: string
    roleLabel?: string | null
    completeOnboarding?: boolean
  },
) {
  await ensureUserProfile(userId)
  const [row] = await db
    .update(userProfiles)
    .set({
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.roleLabel !== undefined ? { roleLabel: input.roleLabel } : {}),
      ...(input.completeOnboarding
        ? { onboardingCompletedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.userId, userId))
    .returning()
  return row
}

export async function isOnboardingComplete(userId: string) {
  const profile = await getUserProfile(userId)
  return Boolean(profile.onboardingCompletedAt)
}
