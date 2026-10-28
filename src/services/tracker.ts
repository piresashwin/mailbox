import { and, desc, eq, sql } from 'drizzle-orm'

import { ForbiddenError, NotFoundError } from '#/core/errors'
import { db } from '#/db'
import {
  classifications,
  mailAccounts,
  messages,
  trackerItems,
} from '#/db/schema'

export type OpenItem = {
  trackerId: number
  messageId: number
  accountId: number
  providerMessageId: string
  threadId: string | null
  subject: string
  fromName: string | null
  fromEmail: string
  snippet: string
  bodyText: string
  webLink: string | null
  provider: string
  accountEmail: string
  category: string
  urgency: number
  reason: string
  receivedAt: string
  status: string
}

async function mapTrackerRows(
  userId: string,
  rows: Array<{
    id: number
    messageId: number
    status: string
    category: string
    urgency: number
  }>,
): Promise<OpenItem[]> {
  const out: OpenItem[] = []
  for (const t of rows) {
    const message = await db.query.messages.findFirst({
      where: eq(messages.id, t.messageId),
    })
    if (!message) continue
    const account = await db.query.mailAccounts.findFirst({
      where: eq(mailAccounts.id, message.accountId),
    })
    if (!account || account.userId !== userId) continue
    const classification = await db.query.classifications.findFirst({
      where: eq(classifications.messageId, message.id),
    })
    out.push({
      trackerId: t.id,
      messageId: message.id,
      accountId: message.accountId,
      providerMessageId: message.providerMessageId,
      threadId: message.threadId,
      subject: message.subject,
      fromName: message.fromName,
      fromEmail: message.fromEmail,
      snippet: message.snippet,
      bodyText: message.bodyText,
      webLink: message.webLink,
      provider: account.provider || 'outlook',
      accountEmail: account.email || '',
      category: t.category,
      urgency: t.urgency,
      reason: classification?.reason || '',
      receivedAt: message.receivedAt.toISOString(),
      status: t.status,
    })
  }
  return out
}

export async function resolveTrackerContext(userId: string, trackerId: number) {
  const tracker = await db.query.trackerItems.findFirst({
    where: eq(trackerItems.id, trackerId),
  })
  if (!tracker) throw new NotFoundError('Tracker item not found')
  const message = await db.query.messages.findFirst({
    where: eq(messages.id, tracker.messageId),
  })
  if (!message) throw new NotFoundError('Message not found')
  const account = await db.query.mailAccounts.findFirst({
    where: eq(mailAccounts.id, message.accountId),
  })
  if (!account) throw new NotFoundError('Account not found')
  if (account.userId !== userId) throw new ForbiddenError()
  const classification = await db.query.classifications.findFirst({
    where: eq(classifications.messageId, message.id),
  })
  return { tracker, message, account, classification }
}

export async function listOpenItemsForUser(userId: string) {
  const now = Date.now()
  const dueSnoozed = await db.query.trackerItems.findMany({
    where: and(
      eq(trackerItems.status, 'snoozed'),
      sql`${trackerItems.snoozedUntil} IS NOT NULL AND ${trackerItems.snoozedUntil} <= ${now}`,
    ),
  })
  for (const row of dueSnoozed) {
    try {
      await resolveTrackerContext(userId, row.id)
    } catch {
      continue
    }
    await db
      .update(trackerItems)
      .set({ status: 'open', snoozedUntil: null, updatedAt: new Date() })
      .where(eq(trackerItems.id, row.id))
  }
  const open = await db.query.trackerItems.findMany({
    where: eq(trackerItems.status, 'open'),
    orderBy: [desc(trackerItems.urgency), desc(trackerItems.createdAt)],
  })
  return mapTrackerRows(userId, open)
}

export async function listDoneItemsForUser(userId: string) {
  const rows = await db.query.trackerItems.findMany({
    where: eq(trackerItems.status, 'done'),
    orderBy: [desc(trackerItems.updatedAt)],
    limit: 80,
  })
  return (await mapTrackerRows(userId, rows)).slice(0, 50)
}

export async function markDoneForUser(userId: string, trackerId: number) {
  await resolveTrackerContext(userId, trackerId)
  await db
    .update(trackerItems)
    .set({ status: 'done', updatedAt: new Date(), snoozedUntil: null })
    .where(eq(trackerItems.id, trackerId))
}

export async function snoozeItemForUser(
  userId: string,
  trackerId: number,
  hours: number,
) {
  await resolveTrackerContext(userId, trackerId)
  const until = new Date(Date.now() + hours * 3600_000)
  await db
    .update(trackerItems)
    .set({ status: 'snoozed', snoozedUntil: until, updatedAt: new Date() })
    .where(eq(trackerItems.id, trackerId))
}

export async function changeCategoryForUser(
  userId: string,
  trackerId: number,
  category: string,
) {
  await resolveTrackerContext(userId, trackerId)
  await db
    .update(trackerItems)
    .set({ category, updatedAt: new Date() })
    .where(eq(trackerItems.id, trackerId))
}
