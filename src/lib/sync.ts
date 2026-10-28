import { eq } from 'drizzle-orm'

import { db } from '#/db'
import {
  mailAccounts,
  classifications,
  messages,
  settings,
  syncState,
  trackerItems,
} from '#/db/schema'
import { upsertCommitmentsForMessage } from '#/lib/commitments'
import { getConnector } from '#/lib/connectors/registry'
import { classifyMessage } from '#/lib/openai'
import { DEFAULT_OPENAI_MODEL } from '#/lib/openai-model'

async function getModel(userId?: string) {
  const row = userId
    ? await db.query.settings.findFirst({ where: eq(settings.userId, userId) })
    : await db.query.settings.findFirst()
  const configured =
    row?.openaiModel || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
  if (configured === 'gpt-4.1-nano') return DEFAULT_OPENAI_MODEL
  return configured
}

export async function syncAccount(accountId: number) {
  const account = await db.query.mailAccounts.findFirst({
    where: eq(mailAccounts.id, accountId),
  })
  if (!account) throw new Error(`Account ${accountId} not found`)

  const connector = getConnector(account.provider)
  const state = await db.query.syncState.findFirst({
    where: eq(syncState.accountId, accountId),
  })
  const { messages: batch, nextCursor } = await connector.fetchNewMessages(
    account,
    state?.cursor ?? null,
  )
  const model = await getModel(account.userId)
  let imported = 0
  let tracked = 0

  let classifyErrors = 0
  for (const msg of batch) {
    const existing = await db.query.messages.findFirst({
      where: (m, { and, eq: e }) =>
        and(e(m.accountId, accountId), e(m.providerMessageId, msg.providerMessageId)),
    })
    if (existing) {
      // Retry classify if a prior sync inserted the row then failed mid-classify
      const classified = await db.query.classifications.findFirst({
        where: eq(classifications.messageId, existing.id),
      })
      if (classified) continue
      try {
        const classification = await classifyMessage({
          subject: existing.subject,
          from: `${existing.fromName || ''} <${existing.fromEmail}>`,
          bodyText: existing.bodyText,
          model,
        })
        await db.insert(classifications).values({
          messageId: existing.id,
          important: classification.important,
          urgency: classification.urgency,
          category: classification.category,
          reason: classification.reason,
          model: classification.model,
        })
        if (classification.important) {
          const [tracker] = await db
            .insert(trackerItems)
            .values({
              messageId: existing.id,
              status: 'open',
              category: classification.category,
              urgency: classification.urgency,
            })
            .returning()
          tracked += 1
          try {
            await upsertCommitmentsForMessage({
              message: existing,
              trackerItemId: tracker.id,
              accountEmail: account.email,
              model,
            })
          } catch {
            // ignore commitment extract failures
          }
        }
      } catch (e) {
        classifyErrors += 1
        if (classifyErrors === 1) {
          console.error('classify retry failed', e)
        }
      }
      continue
    }

    const [inserted] = await db
      .insert(messages)
      .values({
        accountId,
        providerMessageId: msg.providerMessageId,
        threadId: msg.threadId,
        subject: msg.subject,
        fromName: msg.from.name,
        fromEmail: msg.from.email,
        receivedAt: msg.receivedAt,
        snippet: msg.snippet,
        bodyText: msg.bodyText,
        webLink: msg.webLink,
        folder: msg.folder,
      })
      .returning()

    imported += 1
    try {
      const classification = await classifyMessage({
        subject: msg.subject,
        from: `${msg.from.name || ''} <${msg.from.email}>`,
        bodyText: msg.bodyText,
        model,
      })

      await db.insert(classifications).values({
        messageId: inserted.id,
        important: classification.important,
        urgency: classification.urgency,
        category: classification.category,
        reason: classification.reason,
        model: classification.model,
      })

      if (classification.important) {
        const [tracker] = await db
          .insert(trackerItems)
          .values({
            messageId: inserted.id,
            status: 'open',
            category: classification.category,
            urgency: classification.urgency,
          })
          .returning()
        tracked += 1
        try {
          await upsertCommitmentsForMessage({
            message: inserted,
            trackerItemId: tracker.id,
            accountEmail: account.email,
            model,
          })
        } catch {
          // Classification still succeeds if commitment extract fails.
        }
      }
    } catch (e) {
      classifyErrors += 1
      if (classifyErrors === 1) {
        console.error('classify failed', e)
      }
      // Keep imported message; next sync retries classification.
    }
  }

  if (imported > 0 && tracked === 0 && classifyErrors === imported) {
    throw new Error(
      `Synced ${imported} messages but classification failed for all of them (model ${model}). Check OPENAI_MODEL / Settings.`,
    )
  }

  await db
    .insert(syncState)
    .values({
      accountId,
      cursor: nextCursor,
      lastSyncAt: new Date(),
    })
    .onConflictDoUpdate({
      target: syncState.accountId,
      set: { cursor: nextCursor, lastSyncAt: new Date() },
    })

  return { imported, tracked, messageCount: batch.length }
}

export async function syncAllAccounts(userId?: string) {
  const rows = userId
    ? await db.query.mailAccounts.findMany({
        where: eq(mailAccounts.userId, userId),
      })
    : await db.query.mailAccounts.findMany()
  const results = []
  for (const a of rows) {
    results.push({
      accountId: a.id,
      email: a.email,
      ...(await syncAccount(a.id)),
    })
  }
  return results
}

export async function ensureSettingsRow(userId: string) {
  const existing = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  })
  if (!existing) {
    await db.insert(settings).values({ userId })
  }
}
