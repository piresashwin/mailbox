import { and, eq, inArray } from 'drizzle-orm'
import { createHash } from 'node:crypto'

import { db } from '#/db'
import { commitments, mailAccounts, type Message } from '#/db/schema'
import { extractCommitmentsFromMessage } from '#/lib/openai'

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function commitmentFingerprint(
  threadId: string | null | undefined,
  title: string,
) {
  const key = `${threadId || 'msg'}:${normalizeTitle(title)}`
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

export async function upsertCommitmentsForMessage(input: {
  message: Message
  trackerItemId: number | null
  accountEmail: string
  model?: string
}) {
  const { message, trackerItemId, model } = input
  const extracted = await extractCommitmentsFromMessage({
    subject: message.subject,
    from: message.fromName
      ? `${message.fromName} <${message.fromEmail}>`
      : message.fromEmail,
    bodyText: message.bodyText,
    receivedAt: message.receivedAt.toISOString(),
    model,
  })

  let created = 0
  for (const item of extracted) {
    if (item.direction !== 'i_owe') continue
    const fingerprint = commitmentFingerprint(message.threadId, item.title)
    const existing = await db.query.commitments.findFirst({
      where: and(
        eq(commitments.accountId, message.accountId),
        eq(commitments.fingerprint, fingerprint),
      ),
    })

    const dueAt = item.dueAt ? new Date(item.dueAt) : null
    const confidence = Math.round(item.confidence * 100)

    if (existing) {
      if (existing.status === 'open' || existing.status === 'snoozed') {
        await db
          .update(commitments)
          .set({
            title: item.title,
            dueAt,
            dueKind: item.dueKind,
            confidence,
            trackerItemId: trackerItemId ?? existing.trackerItemId,
            messageId: message.id,
            threadId: message.threadId,
            updatedAt: new Date(),
          })
          .where(eq(commitments.id, existing.id))
      }
      continue
    }

    const account = await db.query.mailAccounts.findFirst({
      where: eq(mailAccounts.id, message.accountId),
    })
    if (!account) continue

    await db.insert(commitments).values({
      userId: account.userId,
      trackerItemId,
      messageId: message.id,
      accountId: message.accountId,
      threadId: message.threadId,
      direction: 'i_owe',
      title: item.title,
      dueAt,
      dueKind: item.dueKind,
      confidence,
      status: 'open',
      fingerprint,
      source: 'ai',
      suggestedClear: false,
    })
    created += 1
  }
  return { extracted: extracted.length, created }
}

export async function markCommitmentsSuggestedClear(input: {
  accountId: number
  messageId: number
  threadId: string | null
}) {
  const open = await db.query.commitments.findMany({
    where: and(
      eq(commitments.accountId, input.accountId),
      eq(commitments.status, 'open'),
      eq(commitments.direction, 'i_owe'),
    ),
  })
  const matches = open.filter(
    (c) =>
      c.messageId === input.messageId ||
      (input.threadId && c.threadId === input.threadId),
  )
  if (!matches.length) return []
  const ids = matches.map((m) => m.id)
  await db
    .update(commitments)
    .set({ suggestedClear: true, updatedAt: new Date() })
    .where(inArray(commitments.id, ids))
  return matches
}
