import type {
  AttachmentMeta,
  ConversationMessage,
  DownloadedAttachment,
  NormalizedMessage,
} from '../types'
import { mapGraphMessage, stripHtml, type GraphMessage } from './map'

type DeltaResponse = {
  value?: GraphMessage[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

const GRAPH = 'https://graph.microsoft.com/v1.0'

async function graphFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${GRAPH}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  })
  return res
}

async function graphJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await graphFetch(accessToken, path, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph request failed: ${res.status} ${text}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function escapeODataString(value: string) {
  return value.replace(/'/g, "''")
}

export async function fetchOutlookDelta(
  accessToken: string,
  cursor: string | null,
): Promise<{ messages: NormalizedMessage[]; nextCursor: string | null }> {
  const select =
    '$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,webLink,parentFolderId'
  const url =
    cursor ||
    `${GRAPH}/me/mailFolders/inbox/messages/delta?${select}&$top=50`

  const messages: NormalizedMessage[] = []
  let next: string | null = url
  let deltaLink: string | null = null
  let pages = 0

  while (next && pages < 10) {
    pages += 1
    const res = await fetch(next, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'odata.maxpagesize=50',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Graph delta failed: ${res.status} ${text}`)
    }
    const data = (await res.json()) as DeltaResponse
    for (const item of data.value || []) {
      if (!item.id || (item as { '@removed'?: unknown })['@removed']) continue
      messages.push(mapGraphMessage(item))
    }
    next = data['@odata.nextLink'] || null
    if (data['@odata.deltaLink']) deltaLink = data['@odata.deltaLink']
  }

  return { messages, nextCursor: deltaLink || cursor }
}

type GraphConversationMessage = GraphMessage & {
  hasAttachments?: boolean
}

export async function fetchConversation(
  accessToken: string,
  conversationId: string,
  limit = 30,
): Promise<ConversationMessage[]> {
  const filter = `conversationId eq '${escapeODataString(conversationId)}'`
  const select =
    'id,conversationId,subject,bodyPreview,body,from,receivedDateTime,hasAttachments'
  const path =
    `/me/messages?$filter=${encodeURIComponent(filter)}` +
    `&$select=${select}&$orderby=receivedDateTime desc&$top=${limit}`

  const data = await graphJson<{ value?: GraphConversationMessage[] }>(
    accessToken,
    path,
  )

  return (data.value || [])
    .filter((m) => Boolean(m.id))
    .map((m) => {
      const rawBody = m.body?.content || ''
      const bodyText =
        m.body?.contentType?.toLowerCase() === 'html'
          ? stripHtml(rawBody)
          : rawBody
      return {
        id: m.id,
        from: {
          name: m.from?.emailAddress?.name,
          email: m.from?.emailAddress?.address || 'unknown@unknown',
        },
        receivedAt: m.receivedDateTime
          ? new Date(m.receivedDateTime)
          : new Date(),
        subject: m.subject || '(no subject)',
        bodyText: bodyText.slice(0, 4000),
        hasAttachments: Boolean(m.hasAttachments),
      }
    })
}

type GraphAttachment = {
  id?: string
  name?: string
  contentType?: string
  size?: number
  isInline?: boolean
  '@odata.type'?: string
}

export async function listMessageAttachments(
  accessToken: string,
  providerMessageId: string,
): Promise<AttachmentMeta[]> {
  const path =
    `/me/messages/${encodeURIComponent(providerMessageId)}/attachments` +
    `?$select=id,name,contentType,size,isInline`
  const data = await graphJson<{ value?: GraphAttachment[] }>(
    accessToken,
    path,
  )
  return (data.value || [])
    .filter((a) => a.id && a.name)
    .map((a) => ({
      id: a.id!,
      name: a.name!,
      contentType: a.contentType || 'application/octet-stream',
      size: a.size || 0,
      isInline: Boolean(a.isInline),
    }))
}

export async function downloadMessageAttachment(
  accessToken: string,
  providerMessageId: string,
  attachmentId: string,
): Promise<DownloadedAttachment> {
  const metaPath =
    `/me/messages/${encodeURIComponent(providerMessageId)}/attachments/` +
    encodeURIComponent(attachmentId)
  const meta = await graphJson<GraphAttachment>(accessToken, metaPath)
  const valuePath = `${metaPath}/$value`
  const res = await graphFetch(accessToken, valuePath)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph attachment download failed: ${res.status} ${text}`)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  return {
    bytes: buf,
    contentType: meta.contentType || 'application/octet-stream',
    name: meta.name || 'attachment',
  }
}

export async function sendReply(
  accessToken: string,
  providerMessageId: string,
  bodyText: string,
): Promise<void> {
  const draft = await graphJson<{ id?: string }>(
    accessToken,
    `/me/messages/${encodeURIComponent(providerMessageId)}/createReply`,
    { method: 'POST' },
  )
  if (!draft?.id) throw new Error('Graph createReply did not return a draft id')

  await graphJson(
    accessToken,
    `/me/messages/${encodeURIComponent(draft.id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: {
          contentType: 'Text',
          content: bodyText,
        },
      }),
    },
  )

  await graphJson(
    accessToken,
    `/me/messages/${encodeURIComponent(draft.id)}/send`,
    { method: 'POST' },
  )
}
