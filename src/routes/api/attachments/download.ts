import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { getSession } from '#/auth/session'
import { db } from '#/db'
import { mailAccounts, messages } from '#/db/schema'
import { getConnector } from '#/lib/connectors/registry'

export const Route = createFileRoute('/api/attachments/download')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSession()
        if (!session) {
          return new Response('Sign in required', { status: 401 })
        }

        const url = new URL(request.url)
        const accountId = Number(url.searchParams.get('accountId'))
        const providerMessageId = url.searchParams.get('providerMessageId')
        const attachmentId = url.searchParams.get('attachmentId')

        if (
          !Number.isFinite(accountId) ||
          !providerMessageId ||
          !attachmentId
        ) {
          return new Response('Missing parameters', { status: 400 })
        }

        const account = await db.query.mailAccounts.findFirst({
          where: eq(mailAccounts.id, accountId),
        })
        if (!account || account.userId !== session.user.id) {
          return new Response('Account not found', { status: 404 })
        }

        const message = await db.query.messages.findFirst({
          where: eq(messages.providerMessageId, providerMessageId),
        })
        if (!message || message.accountId !== account.id) {
          return new Response('Message not found', { status: 404 })
        }

        const connector = getConnector(account.provider)
        if (!connector.downloadAttachment) {
          return new Response('Download not supported', { status: 501 })
        }

        try {
          const file = await connector.downloadAttachment(
            account,
            providerMessageId,
            attachmentId,
          )
          const safeName = file.name.replace(/[^\w.\- ()[\]]+/g, '_')
          return new Response(Buffer.from(file.bytes), {
            status: 200,
            headers: {
              'Content-Type': file.contentType,
              'Content-Disposition': `attachment; filename="${safeName}"`,
              'Cache-Control': 'private, no-store',
            },
          })
        } catch (err) {
          const detail = err instanceof Error ? err.message : 'Download failed'
          return new Response(detail, { status: 502 })
        }
      },
    },
  },
})
