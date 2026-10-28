import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'

import { Button } from '#/components/ui/button'
import { runSync } from '#/lib/mailbox'

export const Route = createFileRoute('/_authed/connections/success')({
  component: ConnectSuccessPage,
})

function ConnectSuccessPage() {
  const sync = useMutation({ mutationFn: () => runSync() })

  useEffect(() => {
    void sync.mutateAsync().catch(() => undefined)
  }, [])

  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
      <p className="text-xs font-medium text-[var(--color-muted)]">Step 3 of 3</p>
      <div
        className="h-[72px] w-[72px] rounded-full"
        style={{ background: 'var(--color-accent)' }}
      />
      <h1 className="text-[28px] font-semibold tracking-tight">Account connected</h1>
      <p className="max-w-md text-sm text-[var(--color-muted)]">
        Your account is syncing. Mailbox will classify new mail and surface what
        needs you.
        {sync.isPending ? ' First sync in progress…' : null}
        {sync.isError ? ' Sync can be retried from Needs attention.' : null}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/">View needs attention</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/connections" search={{}}>
            Manage connections
          </Link>
        </Button>
      </div>
    </div>
  )
}
