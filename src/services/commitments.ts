import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { ForbiddenError, NotFoundError } from '#/core/errors'
import { db } from '#/db'
import { commitments, messages, trackerItems } from '#/db/schema'
import { resolveTrackerContext } from '#/services/tracker'

export type CommitmentItem = {
  id: number
  trackerItemId: number | null
  messageId: number
  accountId: number
  threadId: string | null
  title: string
  dueAt: string | null
  dueKind: string
  confidence: number
  status: string
  suggestedClear: boolean
  subject: string
  fromName: string | null
  fromEmail: string
  receivedAt: string
  urgency: number
  category: string
}

async function mapCommitmentRows(
  rows: Array<typeof commitments.$inferSelect>,
): Promise<CommitmentItem[]> {
  const out: CommitmentItem[] = []
  for (const c of rows) {
    const message = await db.query.messages.findFirst({
      where: eq(messages.id, c.messageId),
    })
    if (!message) continue
    const tracker = c.trackerItemId
      ? await db.query.trackerItems.findFirst({
          where: eq(trackerItems.id, c.trackerItemId),
        })
      : await db.query.trackerItems.findFirst({
          where: eq(trackerItems.messageId, c.messageId),
        })
    out.push({
      id: c.id,
      trackerItemId: c.trackerItemId,
      messageId: c.messageId,
      accountId: c.accountId,
      threadId: c.threadId,
      title: c.title,
      dueAt: c.dueAt?.toISOString() ?? null,
      dueKind: c.dueKind,
      confidence: c.confidence,
      status: c.status,
      suggestedClear: Boolean(c.suggestedClear),
      subject: message.subject,
      fromName: message.fromName,
      fromEmail: message.fromEmail,
      receivedAt: message.receivedAt.toISOString(),
      urgency: tracker?.urgency ?? 1,
      category: tracker?.category ?? 'Other',
    })
  }
  return out
}

function startOfLocalDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfLocalDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

async function unsnoozeDue(userId: string) {
  const now = Date.now()
  const dueSnoozed = await db.query.commitments.findMany({
    where: and(
      eq(commitments.userId, userId),
      eq(commitments.status, 'snoozed'),
      sql`${commitments.snoozedUntil} IS NOT NULL AND ${commitments.snoozedUntil} <= ${now}`,
    ),
  })
  for (const row of dueSnoozed) {
    await db
      .update(commitments)
      .set({ status: 'open', snoozedUntil: null, updatedAt: new Date() })
      .where(eq(commitments.id, row.id))
  }
}

export async function listCommitmentsForUser(
  userId: string,
  filter: 'all' | 'overdue' | 'due_soon' | 'open_loops' = 'all',
) {
  await unsnoozeDue(userId)
  const open = await db.query.commitments.findMany({
    where: and(
      eq(commitments.userId, userId),
      eq(commitments.direction, 'i_owe'),
      inArray(commitments.status, ['open', 'snoozed']),
    ),
    orderBy: [asc(commitments.dueAt), desc(commitments.createdAt)],
  })

  const start = startOfLocalDay().getTime()
  const end = endOfLocalDay().getTime()
  const soonEnd = end + 3 * 24 * 3600_000

  const filtered = open.filter((c) => {
    const due = c.dueAt?.getTime()
    if (filter === 'overdue') {
      return c.dueKind === 'firm' && due != null && due < start
    }
    if (filter === 'due_soon') {
      return (
        c.dueKind === 'firm' && due != null && due >= start && due <= soonEnd
      )
    }
    if (filter === 'open_loops') {
      return c.dueKind !== 'firm' || due == null
    }
    return true
  })

  return mapCommitmentRows(filtered)
}

export async function listCommitmentsForTrackerForUser(
  userId: string,
  trackerId: number,
) {
  const { message, tracker } = await resolveTrackerContext(userId, trackerId)
  const rows = await db.query.commitments.findMany({
    where: and(
      eq(commitments.userId, userId),
      eq(commitments.direction, 'i_owe'),
      inArray(commitments.status, ['open', 'snoozed']),
    ),
    orderBy: [asc(commitments.dueAt)],
  })
  const scoped = rows.filter(
    (c) =>
      c.trackerItemId === tracker.id ||
      c.messageId === message.id ||
      (Boolean(message.threadId) && c.threadId === message.threadId),
  )
  return mapCommitmentRows(scoped)
}

export async function updateCommitmentForUser(
  userId: string,
  input: {
    id: number
    status: 'open' | 'snoozed' | 'done' | 'dismissed' | 'parked'
    snoozeHours?: number
  },
) {
  const row = await db.query.commitments.findFirst({
    where: eq(commitments.id, input.id),
  })
  if (!row) throw new NotFoundError('Commitment not found')
  if (row.userId !== userId) throw new ForbiddenError()
  const snoozedUntil =
    input.status === 'snoozed'
      ? new Date(Date.now() + (input.snoozeHours || 24) * 3600_000)
      : null
  await db
    .update(commitments)
    .set({
      status: input.status,
      snoozedUntil,
      suggestedClear: false,
      updatedAt: new Date(),
    })
    .where(eq(commitments.id, input.id))
}

export async function confirmSuggestedClearsForUser(
  userId: string,
  ids?: number[],
) {
  const pending = await db.query.commitments.findMany({
    where: and(
      eq(commitments.userId, userId),
      eq(commitments.suggestedClear, true),
      eq(commitments.status, 'open'),
    ),
  })
  const targetIds = ids?.length
    ? pending.filter((p) => ids.includes(p.id)).map((p) => p.id)
    : pending.map((p) => p.id)
  if (!targetIds.length) return { cleared: 0 }
  await db
    .update(commitments)
    .set({
      status: 'done',
      suggestedClear: false,
      updatedAt: new Date(),
    })
    .where(inArray(commitments.id, targetIds))
  return { cleared: targetIds.length }
}

export async function dismissSuggestedClearsForUser(userId: string) {
  await db
    .update(commitments)
    .set({ suggestedClear: false, updatedAt: new Date() })
    .where(
      and(
        eq(commitments.userId, userId),
        eq(commitments.suggestedClear, true),
      ),
    )
}

export async function getMorningBriefForUser(userId: string) {
  const open = await db.query.commitments.findMany({
    where: and(
      eq(commitments.userId, userId),
      eq(commitments.direction, 'i_owe'),
      eq(commitments.status, 'open'),
    ),
  })
  const start = startOfLocalDay().getTime()
  const end = endOfLocalDay().getTime()
  const agingCutoff = Date.now() - 48 * 3600_000

  const overdue = open.filter(
    (c) => c.dueKind === 'firm' && c.dueAt && c.dueAt.getTime() < start,
  )
  const dueToday = open.filter(
    (c) =>
      c.dueKind === 'firm' &&
      c.dueAt &&
      c.dueAt.getTime() >= start &&
      c.dueAt.getTime() <= end,
  )
  const aging = open.filter(
    (c) =>
      (c.dueKind !== 'firm' || !c.dueAt) &&
      c.createdAt.getTime() <= agingCutoff,
  )

  const top = [...overdue, ...dueToday, ...aging].slice(0, 3)
  const mapped = await mapCommitmentRows(top)
  const suggested = await db.query.commitments.findMany({
    where: and(
      eq(commitments.userId, userId),
      eq(commitments.suggestedClear, true),
      eq(commitments.status, 'open'),
    ),
  })

  return {
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
    agingCount: aging.length,
    highlights: mapped,
    suggestedClear: await mapCommitmentRows(suggested),
  }
}
