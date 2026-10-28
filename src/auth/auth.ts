import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { ensureEnv } from '#/lib/load-env'
import { db } from '#/db'
import * as schema from '#/db/schema'

ensureEnv()

const googleClientId =
  process.env.BETTER_AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
const googleClientSecret =
  process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET ||
  process.env.GOOGLE_CLIENT_SECRET
const microsoftClientId =
  process.env.BETTER_AUTH_MICROSOFT_CLIENT_ID ||
  process.env.MICROSOFT_CLIENT_ID
const microsoftClientSecret =
  process.env.BETTER_AUTH_MICROSOFT_CLIENT_SECRET ||
  process.env.MICROSOFT_CLIENT_SECRET

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || process.env.TOKEN_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            prompt: 'select_account',
          },
        }
      : {}),
    ...(microsoftClientId && microsoftClientSecret
      ? {
          microsoft: {
            clientId: microsoftClientId,
            clientSecret: microsoftClientSecret,
            tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
          },
        }
      : {}),
  },
  user: {
    additionalFields: {},
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          const { ensureUserProfile } = await import(
            '#/services/user-profile'
          )
          await ensureUserProfile(created.id, {
            displayName: created.name || null,
          })
        },
      },
    },
  },
  plugins: [tanstackStartCookies()],
})

export type SessionUser = {
  id: string
  email: string
  name: string
  image?: string | null
}
