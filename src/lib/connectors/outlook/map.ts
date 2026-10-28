import type { NormalizedMessage } from '../types'

type GraphRecipient = {
  emailAddress?: { name?: string; address?: string }
}

type GraphMessage = {
  id: string
  conversationId?: string
  subject?: string
  bodyPreview?: string
  body?: { contentType?: string; content?: string }
  from?: GraphRecipient
  toRecipients?: GraphRecipient[]
  receivedDateTime?: string
  webLink?: string
  parentFolderId?: string
}

export function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapPerson(r?: GraphRecipient) {
  return {
    name: r?.emailAddress?.name,
    email: r?.emailAddress?.address || 'unknown@unknown',
  }
}

export function mapGraphMessage(m: GraphMessage): NormalizedMessage {
  const rawBody = m.body?.content || ''
  const bodyText =
    m.body?.contentType?.toLowerCase() === 'html' ? stripHtml(rawBody) : rawBody
  const truncated = bodyText.slice(0, 4000)
  return {
    providerMessageId: m.id,
    threadId: m.conversationId,
    subject: m.subject || '(no subject)',
    from: mapPerson(m.from),
    to: (m.toRecipients || []).map(mapPerson),
    receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
    snippet: (m.bodyPreview || truncated).slice(0, 280),
    bodyText: truncated,
    webLink: m.webLink,
    folder: m.parentFolderId,
  }
}

export type { GraphMessage }
