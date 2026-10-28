import { eq } from 'drizzle-orm'

import { db } from '#/db'
import { settings } from '#/db/schema'
import { ensureSettingsRow } from '#/lib/sync'

export async function getSettingsForUser(userId: string) {
  await ensureSettingsRow(userId)
  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  })
  return {
    openaiModel:
      row?.openaiModel === 'gpt-4.1-nano'
        ? 'gpt-5.6-luna'
        : row?.openaiModel || 'gpt-5.6-luna',
    pollIntervalSec: row?.pollIntervalSec || 120,
  }
}

export async function updateSettingsForUser(
  userId: string,
  input: { openaiModel: string; pollIntervalSec: number },
) {
  await ensureSettingsRow(userId)
  await db
    .update(settings)
    .set({
      openaiModel: input.openaiModel,
      pollIntervalSec: input.pollIntervalSec,
    })
    .where(eq(settings.userId, userId))
}
