import { eq } from 'drizzle-orm'

import { db } from '#/db'
import { mailAccounts, type MailAccount as Account } from '#/db/schema'
import type { EmailProviderConnector } from '../types'
import {
  exchangeAuthCode,
  fetchMicrosoftProfile,
  getOutlookAuthUrl,
  refreshAccessToken,
} from './auth'
import {
  downloadMessageAttachment,
  fetchConversation,
  fetchOutlookDelta,
  listMessageAttachments,
  sendReply as graphSendReply,
} from './graph'
import { decryptSecret } from '#/lib/crypto'

async function ensureAccessToken(account: Account): Promise<string> {
  const skew = 60_000
  if (account.expiresAt && account.expiresAt > Date.now() + skew) {
    return decryptSecret(account.accessTokenEnc)
  }
  const refreshed = await refreshAccessToken(account)
  await db
    .update(mailAccounts)
    .set({
      accessTokenEnc: refreshed.accessTokenEnc,
      refreshTokenEnc: refreshed.refreshTokenEnc,
      expiresAt: refreshed.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(mailAccounts.id, account.id))
  return refreshed.accessToken
}

export const outlookConnector: EmailProviderConnector = {
  id: 'outlook',
  displayName: 'Microsoft Outlook',
  getAuthUrl: getOutlookAuthUrl,
  async handleAuthCallback(code, redirectUri) {
    const tokens = await exchangeAuthCode(code, redirectUri)
    const profile = await fetchMicrosoftProfile(tokens.accessToken)
    return {
      email: profile.email,
      displayName: profile.displayName,
      tokens: {
        accessTokenEnc: tokens.accessTokenEnc,
        refreshTokenEnc: tokens.refreshTokenEnc,
        expiresAt: tokens.expiresAt,
      },
    }
  },
  ensureAccessToken,
  async fetchNewMessages(account, cursor) {
    const accessToken = await ensureAccessToken(account)
    return fetchOutlookDelta(accessToken, cursor)
  },
  async sendReply(account, providerMessageId, bodyText) {
    const accessToken = await ensureAccessToken(account)
    await graphSendReply(accessToken, providerMessageId, bodyText)
  },
  async fetchConversation(account, conversationId) {
    const accessToken = await ensureAccessToken(account)
    return fetchConversation(accessToken, conversationId)
  },
  async listAttachments(account, providerMessageId) {
    const accessToken = await ensureAccessToken(account)
    return listMessageAttachments(accessToken, providerMessageId)
  },
  async downloadAttachment(account, providerMessageId, attachmentId) {
    const accessToken = await ensureAccessToken(account)
    return downloadMessageAttachment(
      accessToken,
      providerMessageId,
      attachmentId,
    )
  },
}
