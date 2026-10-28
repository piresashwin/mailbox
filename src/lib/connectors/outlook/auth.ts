import { decryptSecret, encryptSecret } from '#/lib/crypto'
import { ensureEnv } from '#/lib/load-env'
import type { Account } from '#/db/schema'
import type { EncryptedTokens } from '../types'

function requireEnv(name: string) {
  ensureEnv()
  const v = process.env[name]
  if (!v || v === '...') throw new Error(`${name} is not configured`)
  return v
}

export function microsoftConfig() {
  ensureEnv()
  return {
    clientId: requireEnv('MICROSOFT_CLIENT_ID'),
    clientSecret: requireEnv('MICROSOFT_CLIENT_SECRET'),
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri:
      process.env.MICROSOFT_REDIRECT_URI ||
      'http://localhost:3000/api/oauth/mail/callback',
    scopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Mail.Read',
      'Mail.Send',
    ],
  }
}

export function getOutlookAuthUrl(state: string) {
  const { clientId, tenantId, redirectUri, scopes } = microsoftConfig()
  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', scopes.join(' '))
  // state carries provider id for the callback (outlook:random)
  url.searchParams.set('state', `outlook:${state}`)
  return url.toString()
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
}

async function exchangeToken(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret, tenantId } = microsoftConfig()
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...body,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft token error: ${res.status} ${text}`)
  }
  return (await res.json()) as TokenResponse
}

export async function exchangeAuthCode(
  code: string,
  redirectUriOverride?: string,
): Promise<EncryptedTokens & { accessToken: string }> {
  const { redirectUri, scopes } = microsoftConfig()
  const token = await exchangeToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUriOverride || redirectUri,
    scope: scopes.join(' '),
  })
  if (!token.refresh_token) {
    throw new Error('Microsoft did not return a refresh_token — ensure offline_access is granted')
  }
  return {
    accessToken: token.access_token,
    accessTokenEnc: encryptSecret(token.access_token),
    refreshTokenEnc: encryptSecret(token.refresh_token),
    expiresAt: Date.now() + token.expires_in * 1000,
  }
}

export async function refreshAccessToken(account: Account): Promise<EncryptedTokens & { accessToken: string }> {
  const { scopes } = microsoftConfig()
  const refreshToken = decryptSecret(account.refreshTokenEnc)
  const token = await exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  })
  return {
    accessToken: token.access_token,
    accessTokenEnc: encryptSecret(token.access_token),
    refreshTokenEnc: token.refresh_token
      ? encryptSecret(token.refresh_token)
      : account.refreshTokenEnc,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
}

export async function fetchMicrosoftProfile(accessToken: string) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Graph /me failed: ${res.status}`)
  }
  const me = (await res.json()) as {
    mail?: string
    userPrincipalName?: string
    displayName?: string
  }
  const email = me.mail || me.userPrincipalName
  if (!email) throw new Error('Could not resolve Microsoft account email')
  return { email, displayName: me.displayName }
}
