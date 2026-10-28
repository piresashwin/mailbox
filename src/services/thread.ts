import { eq } from 'drizzle-orm'

import { db } from '#/db'
import { settings } from '#/db/schema'
import { markCommitmentsSuggestedClear } from '#/lib/commitments'
import { getConnector } from '#/lib/connectors/registry'
import { draftReplyText, summarizeThreadTranscript } from '#/lib/openai'
import { resolveTrackerContext } from '#/services/tracker'

export type ThreadAttachment = {
  id: string
  name: string
  contentType: string
  size: number
  isInline: boolean
  providerMessageId: string
  fromName: string | null
  fromEmail: string
  receivedAt: string
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return out
}

async function modelForUser(userId: string) {
  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  })
  return row?.openaiModel
}

export async function summarizeThreadForUser(
  userId: string,
  trackerId: number,
) {
  const { message, account } = await resolveTrackerContext(userId, trackerId)
  const connector = getConnector(account.provider)
  if (!connector.fetchConversation) {
    throw new Error('Provider does not support conversation fetch')
  }

  let transcriptMessages: Array<{
    from: string
    receivedAt: string
    subject: string
    bodyText: string
  }>

  if (message.threadId) {
    const thread = await connector.fetchConversation(account, message.threadId)
    transcriptMessages = thread.map((m) => ({
      from: m.from.name || m.from.email,
      receivedAt: m.receivedAt.toISOString(),
      subject: m.subject,
      bodyText: m.bodyText.slice(0, 1200),
    }))
  } else {
    transcriptMessages = [
      {
        from: message.fromName || message.fromEmail,
        receivedAt: message.receivedAt.toISOString(),
        subject: message.subject,
        bodyText: message.bodyText.slice(0, 1200),
      },
    ]
  }

  const summary = await summarizeThreadTranscript({
    transcript: transcriptMessages
      .map(
        (m, i) =>
          `[${i + 1}] From: ${m.from}\nDate: ${m.receivedAt}\nSubject: ${m.subject}\n${m.bodyText}`,
      )
      .join('\n\n---\n\n'),
    messageCount: transcriptMessages.length,
    model: await modelForUser(userId),
  })

  return {
    ...summary,
    singleMessage: transcriptMessages.length <= 1,
  }
}

export async function listThreadAttachmentsForUser(
  userId: string,
  trackerId: number,
  scope: 'thread' | 'message',
) {
  const { message, account } = await resolveTrackerContext(userId, trackerId)
  const connector = getConnector(account.provider)
  if (!connector.listAttachments) {
    throw new Error('Provider does not support attachments')
  }

  type MsgRef = {
    providerMessageId: string
    fromName: string | null
    fromEmail: string
    receivedAt: Date
    hasAttachmentsHint?: boolean
  }

  let refs: MsgRef[] = [
    {
      providerMessageId: message.providerMessageId,
      fromName: message.fromName,
      fromEmail: message.fromEmail,
      receivedAt: message.receivedAt,
    },
  ]

  if (scope === 'thread' && message.threadId && connector.fetchConversation) {
    const thread = await connector.fetchConversation(account, message.threadId)
    refs = thread.map((m) => ({
      providerMessageId: m.id,
      fromName: m.from.name || null,
      fromEmail: m.from.email,
      receivedAt: m.receivedAt,
      hasAttachmentsHint: m.hasAttachments,
    }))
    const withHint = refs.filter(
      (r) =>
        r.hasAttachmentsHint ||
        r.providerMessageId === message.providerMessageId,
    )
    if (withHint.length) refs = withHint
  }

  const nested = await mapPool(refs, 3, async (ref) => {
    try {
      const attachments = await connector.listAttachments!(
        account,
        ref.providerMessageId,
      )
      return attachments
        .filter((a) => !a.isInline)
        .map(
          (a): ThreadAttachment => ({
            ...a,
            providerMessageId: ref.providerMessageId,
            fromName: ref.fromName,
            fromEmail: ref.fromEmail,
            receivedAt: ref.receivedAt.toISOString(),
          }),
        )
    } catch {
      return [] as ThreadAttachment[]
    }
  })

  return nested.flat()
}

export async function draftReplyForUser(
  userId: string,
  trackerId: number,
  threadSummary?: string,
) {
  const { message } = await resolveTrackerContext(userId, trackerId)
  const body = await draftReplyText({
    subject: message.subject,
    from: message.fromName
      ? `${message.fromName} <${message.fromEmail}>`
      : message.fromEmail,
    bodyText: message.bodyText,
    threadSummary,
    model: await modelForUser(userId),
  })
  return { body }
}

export async function sendReplyForUser(
  userId: string,
  trackerId: number,
  body: string,
) {
  const { message, account } = await resolveTrackerContext(userId, trackerId)
  const connector = getConnector(account.provider)
  if (!connector.sendReply) {
    throw new Error('Provider does not support sending replies')
  }
  await connector.sendReply(account, message.providerMessageId, body)
  const suggested = await markCommitmentsSuggestedClear({
    accountId: account.id,
    messageId: message.id,
    threadId: message.threadId,
  })
  return { ok: true as const, suggestedClearCount: suggested.length }
}
