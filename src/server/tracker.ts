import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireUserId } from '#/auth/session'
import { ensureSettingsRow } from '#/services/sync'
import {
  changeCategoryForUser,
  listDoneItemsForUser,
  listOpenItemsForUser,
  markDoneForUser,
  snoozeItemForUser,
} from '#/services/tracker'

export type { OpenItem } from '#/services/tracker'

export const listOpenItems = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    await ensureSettingsRow(userId)
    return listOpenItemsForUser(userId)
  },
)

export const listDoneItems = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    return listDoneItemsForUser(userId)
  },
)

export const markDone = createServerFn({ method: 'POST' })
  .validator(z.object({ trackerId: z.number() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    await markDoneForUser(userId, data.trackerId)
    return { ok: true }
  })

export const snoozeItem = createServerFn({ method: 'POST' })
  .validator(z.object({ trackerId: z.number(), hours: z.number() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    await snoozeItemForUser(userId, data.trackerId, data.hours)
    return { ok: true }
  })

export const changeCategory = createServerFn({ method: 'POST' })
  .validator(z.object({ trackerId: z.number(), category: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    await changeCategoryForUser(userId, data.trackerId, data.category)
    return { ok: true }
  })
