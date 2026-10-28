import { getRequestHeaders } from '@tanstack/react-start/server'

import { UnauthorizedError } from '#/core/errors'
import { auth, type SessionUser } from './auth'

export type AppSession = {
  user: SessionUser
  session: {
    id: string
    token: string
    expiresAt: Date
  }
}

export async function getSession(): Promise<AppSession | null> {
  const headers = getRequestHeaders()
  const result = await auth.api.getSession({ headers })
  if (!result?.user) return null
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      image: result.user.image,
    },
    session: {
      id: result.session.id,
      token: result.session.token,
      expiresAt: result.session.expiresAt,
    },
  }
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) throw new UnauthorizedError()
  return session.user
}

export async function requireUserId(): Promise<string> {
  const user = await requireUser()
  return user.id
}
