import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'

import { ForbiddenError, NotFoundError } from '#/core/errors'
import { db } from '#/db'
import { mailAccounts, mailOauthStates } from '#/db/schema'
import { getConnector, listConnectors } from '#/lib/connectors/registry'
import type { EncryptedTokens } from '#/lib/connectors/types'

export function listProviderCatalog() {
  return listConnectors().map((c) => ({ id: c.id, displayName: c.displayName }))
}

export async function listConnectionsForUser(userId: string) {
  const rows = await db.query.mailAccounts.findMany({
    where: eq(mailAccounts.userId, userId),
  })
  const states = await db.query.syncState.findMany()
  const byAccount = Object.fromEntries(states.map((s) => [s.accountId, s]))
  return rows.map((a) => ({
    id: a.id,
    provider: a.provider,
    email: a.email,
    displayName: a.displayName,
    lastSyncAt: byAccount[a.id]?.lastSyncAt?.toISOString() ?? null,
  }))
}

export async function beginMailConnect(userId: string, provider: string) {
  const connector = getConnector(provider)
  const state = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60_000)
  await db.insert(mailOauthStates).values({
    state,
    userId,
    provider: connector.id,
    expiresAt,
  })
  return { url: connector.getAuthUrl(state) }
}

/** OAuth `state` is `provider:nonce` from connectors; DB stores the nonce. */
export function parseMailOauthState(raw: string) {
  if (raw.includes(':')) {
    const [provider, ...rest] = raw.split(':')
    return { provider: provider || null, nonce: rest.join(':') }
  }
  return { provider: null, nonce: raw }
}

export async function consumeMailOauthState(rawState: string) {
  const { nonce } = parseMailOauthState(rawState)
  const row = await db.query.mailOauthStates.findFirst({
    where: eq(mailOauthStates.state, nonce),
  })
  if (!row) return null
  await db.delete(mailOauthStates).where(eq(mailOauthStates.state, nonce))
  if (row.expiresAt.getTime() < Date.now()) return null
  return row
}

export async function upsertMailAccount(input: {
  userId: string
  provider: string
  email: string
  displayName?: string
  tokens: EncryptedTokens
}) {
  const existing = await db.query.mailAccounts.findFirst({
    where: and(
      eq(mailAccounts.userId, input.userId),
      eq(mailAccounts.provider, input.provider),
      eq(mailAccounts.email, input.email),
    ),
  })
  if (existing) {
    await db
      .update(mailAccounts)
      .set({
        displayName: input.displayName,
        accessTokenEnc: input.tokens.accessTokenEnc,
        refreshTokenEnc: input.tokens.refreshTokenEnc,
        expiresAt: input.tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(mailAccounts.id, existing.id))
    return existing.id
  }
  const [row] = await db
    .insert(mailAccounts)
    .values({
      userId: input.userId,
      provider: input.provider,
      email: input.email,
      displayName: input.displayName,
      accessTokenEnc: input.tokens.accessTokenEnc,
      refreshTokenEnc: input.tokens.refreshTokenEnc,
      expiresAt: input.tokens.expiresAt,
    })
    .returning()
  return row.id
}

export async function disconnectMailAccount(userId: string, accountId: number) {
  const account = await db.query.mailAccounts.findFirst({
    where: eq(mailAccounts.id, accountId),
  })
  if (!account) throw new NotFoundError('Mail account not found')
  if (account.userId !== userId) throw new ForbiddenError()
  await db.delete(mailAccounts).where(eq(mailAccounts.id, accountId))
}

export async function requireMailAccountForUser(
  userId: string,
  accountId: number,
) {
  const account = await db.query.mailAccounts.findFirst({
    where: eq(mailAccounts.id, accountId),
  })
  if (!account) throw new NotFoundError('Mail account not found')
  if (account.userId !== userId) throw new ForbiddenError()
  return account
}
