import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireUserId } from '#/auth/session'
import {
  draftReplyForUser,
  listThreadAttachmentsForUser,
  sendReplyForUser,
  summarizeThreadForUser,
} from '#/services/thread'

export type { ThreadAttachment } from '#/services/thread'

export const summarizeThread = createServerFn({ method: 'POST' })
  .validator(z.object({ trackerId: z.number() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    return summarizeThreadForUser(userId, data.trackerId)
  })

export const listThreadAttachments = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      trackerId: z.number(),
      scope: z.enum(['thread', 'message']),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    return listThreadAttachmentsForUser(userId, data.trackerId, data.scope)
  })

export const draftReplyWithAi = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      trackerId: z.number(),
      threadSummary: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    return draftReplyForUser(userId, data.trackerId, data.threadSummary)
  })

export const sendReply = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      trackerId: z.number(),
      body: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    return sendReplyForUser(userId, data.trackerId, data.body)
  })
