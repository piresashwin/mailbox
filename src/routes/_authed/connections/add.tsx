import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

import { Button } from '#/components/ui/button'
import { beginConnect } from '#/lib/mailbox'

export const Route = createFileRoute('/_authed/connections/add')({
  component: AddConnectorPage,
})

function AddConnectorPage() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'outlook' | 'gmail' | null>(null)

  const connect = async (provider: 'outlook' | 'gmail') => {
    setPending(provider)
    setError(null)
    try {
      const { url } = await beginConnect({ data: { provider } })
      window.location.href = url
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Failed to start ${provider === 'outlook' ? 'Outlook' : 'Gmail'} connect`,
      )
      setPending(null)
    }
  }

  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center gap-5 p-8">
      <p className="text-xs font-medium text-[var(--color-muted)]">Step 1 of 3</p>
      <h1 className="text-[28px] font-semibold tracking-tight">Choose a provider</h1>
      <p className="max-w-md text-center text-sm text-[var(--color-muted)]">
        Connectors normalize mail into one attention queue.
      </p>
      {error ? (
        <p className="max-w-md text-center text-sm text-[var(--color-urgent)]">{error}</p>
      ) : null}
      <div className="flex w-full max-w-[720px] flex-col gap-4 sm:flex-row">
        <article className="surface-card flex flex-1 flex-col gap-3 p-6">
          <div
            className="h-11 w-11 rounded-full"
            style={{ background: 'var(--color-accent)' }}
          />
          <h2 className="text-xl font-semibold">Microsoft Outlook</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Work or personal Microsoft account via Graph. Read and send mail.
          </p>
          <Button
            type="button"
            onClick={() => void connect('outlook')}
            disabled={pending !== null}
          >
            {pending === 'outlook' ? 'Redirecting…' : 'Continue with Outlook'}
          </Button>
        </article>
        <article className="surface-card flex flex-1 flex-col gap-3 p-6">
          <div
            className="h-11 w-11 rounded-full"
            style={{ background: '#ea4335' }}
          />
          <h2 className="text-xl font-semibold">Gmail</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Personal Google account via Gmail API. Read and send mail.
          </p>
          <Button
            type="button"
            onClick={() => void connect('gmail')}
            disabled={pending !== null}
          >
            {pending === 'gmail' ? 'Redirecting…' : 'Continue with Gmail'}
          </Button>
        </article>
      </div>
      <Link
        to="/connections"
        search={{}}
        className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-muted)]"
      >
        <ArrowLeft size={14} />
        Back to connections
      </Link>
    </div>
  )
}
