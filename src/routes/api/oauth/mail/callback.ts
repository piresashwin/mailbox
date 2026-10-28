import { createFileRoute } from '@tanstack/react-router'

import { handleMailOauthCallback } from '#/services/mail-oauth-callback'

export const Route = createFileRoute('/api/oauth/mail/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => handleMailOauthCallback(request),
    },
  },
})
