import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireUserId } from '#/auth/session'
import {
  confirmSuggestedClearsForUser,
  dismissSuggestedClearsForUser,
  getMorningBriefForUser,
  listCommitmentsForTrackerForUser,
  listCommitmentsForUser,
  updateCommitmentForUser,
} from '#/services/commitments'
import { ensureSettingsRow } from '#/services/sync'

export type { CommitmentItem } from '#/services/commitments'

export const listCommitments = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        filter: z
          .enum(['all', 'overdue', 'due_soon', 'open_loops'])
          .optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    await ensureSettingsRow(userId)
    return listCommitmentsForUser(userId, data?.filter || 'all')
  })

export const listCommitmentsForTracker = createServerFn({ method: 'POST' })
  .validator(z.object({ trackerId: z.number() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    return listCommitmentsForTrackerForUser(userId, data.trackerId)
  })

export const updateCommitment = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.number(),
      status: z.enum(['open', 'snoozed', 'done', 'dismissed', 'parked']),
      snoozeHours: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    await updateCommitmentForUser(userId, data)
    return { ok: true }
  })

export const confirmSuggestedClears = createServerFn({ method: 'POST' })
  .validator(z.object({ ids: z.array(z.number()).optional() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const result = await confirmSuggestedClearsForUser(userId, data.ids)
    return { ok: true, ...result }
  })

export const dismissSuggestedClears = createServerFn({ method: 'POST' }).handler(
  async () => {
    const userId = await requireUserId()
    await dismissSuggestedClearsForUser(userId)
    return { ok: true }
  },
)

export const getMorningBrief = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    await ensureSettingsRow(userId)
    return getMorningBriefForUser(userId)
  },
)
