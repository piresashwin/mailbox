import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireUserId } from '#/auth/session'
import {
  beginMailConnect,
  disconnectMailAccount,
  listConnectionsForUser,
  listProviderCatalog,
} from '#/services/mail-connection'
import { ensureSettingsRow, syncAllAccounts } from '#/services/sync'

export const listProviderCatalogFn = createServerFn({ method: 'GET' }).handler(
  async () => listProviderCatalog(),
)

export const listConnections = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    await ensureSettingsRow(userId)
    return listConnectionsForUser(userId)
  },
)

export const beginConnect = createServerFn({ method: 'POST' })
  .validator(z.object({ provider: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    return beginMailConnect(userId, data.provider)
  })

export const disconnectAccount = createServerFn({ method: 'POST' })
  .validator(z.object({ accountId: z.number() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    await disconnectMailAccount(userId, data.accountId)
    return { ok: true }
  })

export const runSync = createServerFn({ method: 'POST' }).handler(async () => {
  const userId = await requireUserId()
  await ensureSettingsRow(userId)
  return syncAllAccounts(userId)
})
