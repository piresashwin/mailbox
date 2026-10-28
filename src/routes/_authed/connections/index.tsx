import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Plus } from 'lucide-react'

import { AppShell } from '#/components/AppShell'
import { Button } from '#/components/ui/button'
import {
  disconnectAccount,
  listConnections,
} from '#/lib/mailbox'

export const Route = createFileRoute('/_authed/connections/')({
  component: ConnectionsPage,
  validateSearch: (search: Record<string, unknown>): { error?: string } => {
    if (typeof search.error === 'string') return { error: search.error }
    return {}
  },
  loader: async () => {
    try {
      return await listConnections()
    } catch {
      return []
    }
  },
})

function ConnectionsPage() {
  const initial = Route.useLoaderData()
  const { error } = Route.useSearch()
  const queryClient = useQueryClient()
  const { data = initial } = useQuery({
    queryKey: ['connections'],
    queryFn: () => listConnections(),
    initialData: initial,
  })

  const disconnect = useMutation({
    mutationFn: (accountId: number) => disconnectAccount({ data: { accountId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  if (data.length === 0) {
    return (
      <AppShell active="connections">
        {error ? (
          <p className="mb-4 rounded-[var(--radius-md)] bg-red-50 px-3 py-2 text-sm text-[var(--color-urgent)]">
            {error}
          </p>
        ) : null}
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="surface-card flex w-full max-w-lg flex-col items-center gap-4 p-8 text-center">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-[10px]"
              style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
            >
              <Mail size={22} />
            </div>
            <h1 className="page-title">
              Connect an email provider
            </h1>
            <p className="text-sm text-[var(--color-muted)]">
              Mailbox watches your inbox through connectors, then tracks only
              mail that needs you. Connect Outlook or Gmail.
            </p>
            <Button asChild className="w-full">
              <Link to="/connections/add">
                <Plus size={16} />
                Add connector
              </Link>
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell active="connections">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Connections</h1>
          <p className="page-subtitle">
            Email providers plug in through connectors. Outlook and Gmail are
            live.
          </p>
        </div>
        <Button asChild>
          <Link to="/connections/add">
            <Plus size={14} />
            Add connector
          </Link>
        </Button>
      </div>
      {error ? (
        <p className="mb-4 rounded-[var(--radius-md)] bg-red-50 px-3 py-2 text-sm text-[var(--color-urgent)]">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {data.map((account) => (
          <article
            key={account.id}
            className="surface-card flex items-center justify-between gap-4 p-5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Mail size={18} color="var(--color-accent)" className="mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">
                  {account.provider === 'outlook'
                    ? 'Microsoft Outlook'
                    : account.provider === 'gmail'
                      ? 'Gmail'
                      : account.provider}
                </h2>
                <p className="text-sm text-[var(--color-muted)]">
                  Connected · {account.email}
                  {account.lastSyncAt
                    ? ` · last sync ${new Date(account.lastSyncAt).toLocaleString()}`
                    : ' · not synced yet'}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => disconnect.mutate(account.id)}
              disabled={disconnect.isPending}
            >
              Disconnect
            </Button>
          </article>
        ))}
      </div>
    </AppShell>
  )
}
