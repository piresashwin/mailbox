import type { MailAccount as Account } from '#/db/schema'

export type ProviderId = 'outlook' | 'gmail'

export type EncryptedTokens = {
  accessTokenEnc: string
  refreshTokenEnc: string
  expiresAt: number | null
}

export type NormalizedMessage = {
  providerMessageId: string
  threadId?: string
  subject: string
  from: { name?: string; email: string }
  to: { name?: string; email: string }[]
  receivedAt: Date
  snippet: string
  bodyText: string
  webLink?: string
  folder?: string
}

export type ConversationMessage = {
  id: string
  from: { name?: string; email: string }
  receivedAt: Date
  subject: string
  bodyText: string
  hasAttachments: boolean
}

export type AttachmentMeta = {
  id: string
  name: string
  contentType: string
  size: number
  isInline: boolean
}

export type DownloadedAttachment = {
  bytes: Uint8Array
  contentType: string
  name: string
}

export type EmailProviderConnector = {
  id: ProviderId
  displayName: string
  getAuthUrl: (state: string) => string
  handleAuthCallback: (
    code: string,
    redirectUri?: string,
  ) => Promise<{ email: string; displayName?: string; tokens: EncryptedTokens }>
  ensureAccessToken: (account: Account) => Promise<string>
  fetchNewMessages: (
    account: Account,
    cursor: string | null,
  ) => Promise<{ messages: NormalizedMessage[]; nextCursor: string | null }>
  disconnect?: (account: Account) => Promise<void>
  sendReply?: (
    account: Account,
    providerMessageId: string,
    bodyText: string,
  ) => Promise<void>
  fetchConversation?: (
    account: Account,
    conversationId: string,
  ) => Promise<ConversationMessage[]>
  listAttachments?: (
    account: Account,
    providerMessageId: string,
  ) => Promise<AttachmentMeta[]>
  downloadAttachment?: (
    account: Account,
    providerMessageId: string,
    attachmentId: string,
  ) => Promise<DownloadedAttachment>
}
