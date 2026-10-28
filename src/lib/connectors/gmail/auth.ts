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

export const GMAIL_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
] as const

const REQUIRED_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
] as const

export function googleConfig() {
  ensureEnv()
  return {
    clientId: requireEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:3000/api/oauth/mail/callback',
    scopes: [...GMAIL_SCOPES],
  }
}

export function assertGmailScopes(scope: string | undefined) {
  const granted = new Set((scope || '').split(/\s+/).filter(Boolean))
  const missing = REQUIRED_GMAIL_SCOPES.filter((s) => !granted.has(s))
  if (missing.length) {
    throw new Error(
      'Google did not grant Gmail access. In Google Cloud → OAuth consent screen, add scopes gmail.readonly and gmail.send, add yourself as a test user, then disconnect and reconnect Gmail (revoke Mailbox under Google Account → Third-party access if needed).',
    )
  }
}

export function getGmailAuthUrl(state: string) {
  const { clientId, redirectUri, scopes } = googleConfig()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('access_type', 'offline')
  // Force full consent so Gmail scopes are not skipped after a prior openid-only grant
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', `gmail:${state}`)
  return url.toString()
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type?: string
}

async function exchangeToken(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleConfig()
  const res = await fetch('https://oauth2.googleapis.com/token', {
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
    throw new Error(`Google token error: ${res.status} ${text}`)
  }
  return (await res.json()) as TokenResponse
}

export async function exchangeAuthCode(
  code: string,
  redirectUriOverride?: string,
): Promise<EncryptedTokens & { accessToken: string }> {
  const { redirectUri } = googleConfig()
  const token = await exchangeToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUriOverride || redirectUri,
  })
  if (!token.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token — disconnect the app in Google Account permissions and reconnect with consent',
    )
  }
  assertGmailScopes(token.scope)
  return {
    accessToken: token.access_token,
    accessTokenEnc: encryptSecret(token.access_token),
    refreshTokenEnc: encryptSecret(token.refresh_token),
    expiresAt: Date.now() + token.expires_in * 1000,
  }
}

export async function refreshAccessToken(
  account: Account,
): Promise<EncryptedTokens & { accessToken: string }> {
  const refreshToken = decryptSecret(account.refreshTokenEnc)
  const token = await exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
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

export async function fetchGoogleProfile(accessToken: string) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${res.status}`)
  }
  const me = (await res.json()) as {
    email?: string
    name?: string
    email_verified?: boolean
  }
  if (!me.email) throw new Error('Could not resolve Google account email')
  return { email: me.email, displayName: me.name }
}
