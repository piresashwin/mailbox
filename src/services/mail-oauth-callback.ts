import { getConnector } from '#/lib/connectors/registry'
import {
  consumeMailOauthState,
  upsertMailAccount,
} from '#/services/mail-connection'
import { ensureSettingsRow } from '#/services/sync'

/** Handler for mail connector OAuth return at `/api/oauth/mail/callback`. */
export async function handleMailOauthCallback(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const rawState = url.searchParams.get('state') || ''
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  const origin = url.origin
  // Must match the redirect_uri used in the authorize request.
  const redirectUri = `${url.origin}${url.pathname}`

  if (error) {
    const detail = errorDescription ? `${error}: ${errorDescription}` : error
    return Response.redirect(
      `${origin}/connections?error=${encodeURIComponent(detail)}`,
      302,
    )
  }
  if (!code || !rawState) {
    return Response.redirect(
      `${origin}/connections?error=missing_code_or_state`,
      302,
    )
  }

  try {
    const oauth = await consumeMailOauthState(rawState)
    if (!oauth) {
      return Response.redirect(
        `${origin}/connections?error=${encodeURIComponent('Invalid or expired OAuth state — sign in and try again')}`,
        302,
      )
    }

    await ensureSettingsRow(oauth.userId)
    const connector = getConnector(oauth.provider)
    const result = await connector.handleAuthCallback(code, redirectUri)
    await upsertMailAccount({
      userId: oauth.userId,
      provider: connector.id,
      email: result.email,
      displayName: result.displayName,
      tokens: result.tokens,
    })
    return Response.redirect(`${origin}/connections/success`, 302)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'auth_failed'
    return Response.redirect(
      `${origin}/connections?error=${encodeURIComponent(message)}`,
      302,
    )
  }
}
