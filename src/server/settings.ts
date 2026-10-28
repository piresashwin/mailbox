import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireUserId } from '#/auth/session'
import {
  getSettingsForUser,
  updateSettingsForUser,
} from '#/services/settings'

export const getSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    return getSettingsForUser(userId)
  },
)

export const updateSettings = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      openaiModel: z.string(),
      pollIntervalSec: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    await updateSettingsForUser(userId, data)
    return { ok: true }
  })
