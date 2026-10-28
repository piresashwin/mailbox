import type {
  AttachmentMeta,
  ConversationMessage,
  DownloadedAttachment,
  NormalizedMessage,
} from '../types'
import {
  collectAttachmentParts,
  decodeBase64Url,
  encodeBase64Url,
  extractBodyText,
  headerValue,
  mapGmailMessage,
  type GmailMessage,
} from './map'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

async function gmailFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${GMAIL}${path}`
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  })
}

async function gmailJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await gmailFetch(accessToken, path, init)
  if (!res.ok) {
    const text = await res.text()
    if (
      res.status === 403 &&
      /insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(text)
    ) {
      throw new Error(
        'Gmail token is missing mail scopes. Disconnect Gmail, ensure gmail.readonly + gmail.send are on the OAuth consent screen, revoke prior access at myaccount.google.com/permissions if needed, then reconnect.',
      )
    }
    const err = new Error(`Gmail request failed: ${res.status} ${text}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function fetchGmailProfile(accessToken: string) {
  return gmailJson<{ emailAddress?: string; historyId?: string; messagesTotal?: number }>(
    accessToken,
    '/profile',
  )
}

async function getMessageFull(
  accessToken: string,
  id: string,
): Promise<GmailMessage | null> {
  try {
    return await gmailJson<GmailMessage>(
      accessToken,
      `/messages/${encodeURIComponent(id)}?format=full`,
    )
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 404) return null
    throw e
  }
}

async function fetchMessagesByIds(
  accessToken: string,
  ids: string[],
): Promise<NormalizedMessage[]> {
  const unique = [...new Set(ids)].slice(0, 100)
  const out: NormalizedMessage[] = []
  // Sequential to avoid burst rate limits on personal accounts
  for (const id of unique) {
    const msg = await getMessageFull(accessToken, id)
    if (!msg?.id) continue
    if (msg.labelIds && !msg.labelIds.includes('INBOX')) continue
    out.push(mapGmailMessage(msg))
  }
  return out
}

async function backfillInbox(
  accessToken: string,
): Promise<{ messages: NormalizedMessage[]; historyId: string }> {
  const profile = await fetchGmailProfile(accessToken)
  const historyId = profile.historyId
  if (!historyId) throw new Error('Gmail profile missing historyId')

  const list = await gmailJson<{ messages?: { id: string }[]; resultSizeEstimate?: number }>(
    accessToken,
    '/messages?labelIds=INBOX&maxResults=50&q=' + encodeURIComponent('newer_than:14d'),
  )
  const ids = (list.messages || []).map((m) => m.id)
  const messages = await fetchMessagesByIds(accessToken, ids)
  return { messages, historyId }
}

type HistoryResponse = {
  history?: Array<{
    id?: string
    messagesAdded?: Array<{ message?: { id?: string; labelIds?: string[] } }>
  }>
  historyId?: string
  nextPageToken?: string
}

async function fetchHistoryIncremental(
  accessToken: string,
  startHistoryId: string,
): Promise<{ messages: NormalizedMessage[]; nextCursor: string }> {
  const messageIds: string[] = []
  let pageToken: string | undefined
  let latestHistoryId = startHistoryId
  let pages = 0

  do {
    pages += 1
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
      maxResults: '100',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await gmailJson<HistoryResponse>(
      accessToken,
      `/history?${params.toString()}`,
    )
    if (data.historyId) latestHistoryId = data.historyId
    for (const h of data.history || []) {
      for (const added of h.messagesAdded || []) {
        const id = added.message?.id
        const labels = added.message?.labelIds
        if (!id) continue
        if (labels && !labels.includes('INBOX')) continue
        messageIds.push(id)
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken && pages < 10)

  const messages = await fetchMessagesByIds(accessToken, messageIds)
  return { messages, nextCursor: latestHistoryId }
}

export async function fetchGmailSync(
  accessToken: string,
  cursor: string | null,
): Promise<{ messages: NormalizedMessage[]; nextCursor: string | null }> {
  if (!cursor) {
    const { messages, historyId } = await backfillInbox(accessToken)
    return { messages, nextCursor: historyId }
  }

  try {
    return await fetchHistoryIncremental(accessToken, cursor)
  } catch (e) {
    const status = (e as { status?: number }).status
    // Stale historyId — reset with backfill
    if (status === 404) {
      const { messages, historyId } = await backfillInbox(accessToken)
      return { messages, nextCursor: historyId }
    }
    throw e
  }
}

export async function fetchConversation(
  accessToken: string,
  threadId: string,
  limit = 30,
): Promise<ConversationMessage[]> {
  const thread = await gmailJson<{
    id?: string
    messages?: GmailMessage[]
  }>(accessToken, `/threads/${encodeURIComponent(threadId)}?format=full`)

  const msgs = [...(thread.messages || [])]
    .filter((m) => Boolean(m.id))
    .slice(-limit)
    .reverse()

  return msgs.map((m) => {
    const headers = m.payload?.headers
    const fromRaw = headerValue(headers, 'From') || ''
    const angled = fromRaw.match(/^(.*)<([^>]+)>$/)
    const from = angled
      ? {
          name: angled[1].replace(/^"|"$/g, '').trim() || undefined,
          email: angled[2].trim(),
        }
      : { email: fromRaw.trim() || 'unknown@unknown' }
    const bodyText = extractBodyText(m.payload).slice(0, 4000)
    const receivedAt = m.internalDate
      ? new Date(Number(m.internalDate))
      : new Date()
    const attachments = collectAttachmentParts(m.payload)
    return {
      id: m.id,
      from,
      receivedAt,
      subject: headerValue(headers, 'Subject') || '(no subject)',
      bodyText,
      hasAttachments: attachments.length > 0,
    }
  })
}

export async function listMessageAttachments(
  accessToken: string,
  providerMessageId: string,
): Promise<AttachmentMeta[]> {
  const msg = await getMessageFull(accessToken, providerMessageId)
  if (!msg) return []
  return collectAttachmentParts(msg.payload).map((a) => ({
    id: a.attachmentId,
    name: a.filename,
    contentType: a.mimeType,
    size: a.size,
    isInline: a.isInline,
  }))
}

export async function downloadMessageAttachment(
  accessToken: string,
  providerMessageId: string,
  attachmentId: string,
): Promise<DownloadedAttachment> {
  const msg = await getMessageFull(accessToken, providerMessageId)
  const meta = collectAttachmentParts(msg?.payload).find(
    (a) => a.attachmentId === attachmentId,
  )
  const data = await gmailJson<{ size?: number; data?: string }>(
    accessToken,
    `/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  )
  if (!data.data) throw new Error('Gmail attachment missing data')
  return {
    bytes: new Uint8Array(decodeBase64Url(data.data)),
    contentType: meta?.mimeType || 'application/octet-stream',
    name: meta?.filename || 'attachment',
  }
}

function encodeHeaderValue(value: string) {
  // RFC 2047 for non-ascii
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`
}

export async function sendReply(
  accessToken: string,
  providerMessageId: string,
  bodyText: string,
  fromEmail: string,
): Promise<void> {
  const original = await getMessageFull(accessToken, providerMessageId)
  if (!original) throw new Error('Original Gmail message not found')

  const headers = original.payload?.headers
  const subject = headerValue(headers, 'Subject') || '(no subject)'
  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`
  const to =
    headerValue(headers, 'Reply-To') ||
    headerValue(headers, 'From') ||
    'unknown@unknown'
  const messageId = headerValue(headers, 'Message-ID')
  const references = headerValue(headers, 'References')
  const refLine = [references, messageId].filter(Boolean).join(' ').trim()

  const lines = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(replySubject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ]
  if (messageId) lines.push(`In-Reply-To: ${messageId}`)
  if (refLine) lines.push(`References: ${refLine}`)
  lines.push('', bodyText.replace(/\r?\n/g, '\r\n'))

  const raw = encodeBase64Url(lines.join('\r\n'))
  await gmailJson(accessToken, '/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raw,
      threadId: original.threadId,
    }),
  })
}
