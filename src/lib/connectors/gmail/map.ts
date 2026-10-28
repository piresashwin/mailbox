import type { NormalizedMessage } from '../types'

export type GmailHeader = { name?: string; value?: string }

export type GmailBody = {
  attachmentId?: string
  size?: number
  data?: string
}

export type GmailPart = {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: GmailBody
  parts?: GmailPart[]
}

export type GmailMessage = {
  id: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailPart
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

export function decodeBase64Url(data: string): Buffer {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, 'base64')
}

export function encodeBase64Url(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function headerValue(
  headers: GmailHeader[] | undefined,
  name: string,
): string | undefined {
  const needle = name.toLowerCase()
  return headers?.find((h) => (h.name || '').toLowerCase() === needle)?.value
}

function parseAddressList(raw: string | undefined): { name?: string; email: string }[] {
  if (!raw?.trim()) return []
  // Split on commas that are not inside quotes
  const parts = raw.match(/(?:[^,"]|"(?:\\.|[^"])*")+/g) || [raw]
  return parts.map((part) => {
    const trimmed = part.trim()
    const angled = trimmed.match(/^(.*)<([^>]+)>$/)
    if (angled) {
      const name = angled[1].replace(/^"|"$/g, '').trim()
      return { name: name || undefined, email: angled[2].trim() }
    }
    return { email: trimmed }
  })
}

function collectBodies(
  part: GmailPart | undefined,
  out: { plain?: string; html?: string },
) {
  if (!part) return
  const mime = (part.mimeType || '').toLowerCase()
  if (part.body?.data && !part.filename) {
    const text = decodeBase64Url(part.body.data).toString('utf8')
    if (mime === 'text/plain' && !out.plain) out.plain = text
    if (mime === 'text/html' && !out.html) out.html = text
  }
  for (const child of part.parts || []) collectBodies(child, out)
}

export function extractBodyText(payload: GmailPart | undefined): string {
  const bodies: { plain?: string; html?: string } = {}
  collectBodies(payload, bodies)
  if (bodies.plain) return bodies.plain
  if (bodies.html) return stripHtml(bodies.html)
  return ''
}

export type AttachmentPart = {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  isInline: boolean
}

export function collectAttachmentParts(
  part: GmailPart | undefined,
  out: AttachmentPart[] = [],
): AttachmentPart[] {
  if (!part) return out
  const filename = part.filename?.trim()
  const attachmentId = part.body?.attachmentId
  if (filename && attachmentId) {
    const disposition = (
      headerValue(part.headers, 'Content-Disposition') || ''
    ).toLowerCase()
    const contentId = headerValue(part.headers, 'Content-ID')
    out.push({
      attachmentId,
      filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: part.body?.size || 0,
      isInline: disposition.includes('inline') || Boolean(contentId),
    })
  }
  for (const child of part.parts || []) collectAttachmentParts(child, out)
  return out
}

export function mapGmailMessage(m: GmailMessage): NormalizedMessage {
  const headers = m.payload?.headers
  const subject = headerValue(headers, 'Subject') || '(no subject)'
  const fromRaw = headerValue(headers, 'From')
  const toRaw = headerValue(headers, 'To')
  const dateRaw = headerValue(headers, 'Date')
  const from = parseAddressList(fromRaw)[0] || {
    email: 'unknown@unknown',
  }
  const bodyText = extractBodyText(m.payload).slice(0, 4000)
  const receivedAt = m.internalDate
    ? new Date(Number(m.internalDate))
    : dateRaw
      ? new Date(dateRaw)
      : new Date()
  return {
    providerMessageId: m.id,
    threadId: m.threadId,
    subject,
    from,
    to: parseAddressList(toRaw),
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    snippet: (m.snippet || bodyText).slice(0, 280),
    bodyText,
    webLink: m.threadId
      ? `https://mail.google.com/mail/u/0/#inbox/${m.threadId}`
      : undefined,
    folder: m.labelIds?.includes('INBOX') ? 'INBOX' : m.labelIds?.[0],
  }
}
