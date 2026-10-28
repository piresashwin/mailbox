import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { AppShell } from '#/components/AppShell'
import { Button } from '#/components/ui/button'
import {
  getSettings,
  runSync,
  updateSettings,
} from '#/lib/mailbox'

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
  loader: async () => {
    try {
      return await getSettings()
    } catch {
      return { openaiModel: 'gpt-5.6-luna', pollIntervalSec: 120 }
    }
  },
})

function SettingsPage() {
  const initial = Route.useLoaderData()
  const queryClient = useQueryClient()
  const { data = initial } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
    initialData: initial,
  })
  const [model, setModel] = useState(data.openaiModel)
  const [poll, setPoll] = useState(String(data.pollIntervalSec))

  const save = useMutation({
    mutationFn: () =>
      updateSettings({
        data: {
          openaiModel: model,
          pollIntervalSec: Number(poll) || 120,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  const sync = useMutation({ mutationFn: () => runSync() })

  return (
    <AppShell active="settings">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle mb-5">
        Classification and sync — OpenAI + connectors
      </p>

      <div className="mb-4 surface-card flex flex-col gap-3 p-5">
        <label className="text-sm font-semibold" htmlFor="model">
          OpenAI model
        </label>
        <select
          id="model"
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 text-sm"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="gpt-5.6-luna">gpt-5.6-luna (default)</option>
          <option value="gpt-5.4-nano">gpt-5.4-nano</option>
          <option value="gpt-5-mini">gpt-5-mini</option>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
        </select>
        <p className="text-sm text-[var(--color-muted)]">
          Used to classify new mail on sync. Luna replaces retired gpt-4.1-nano.
        </p>
      </div>

      <div className="mb-5 surface-card flex flex-col gap-3 p-5">
        <label className="text-sm font-semibold" htmlFor="poll">
          Poll interval (seconds)
        </label>
        <input
          id="poll"
          type="number"
          min={60}
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 text-sm"
          value={poll}
          onChange={(e) => setPoll(e.target.value)}
        />
        <p className="text-sm text-[var(--color-muted)]">
          Default every 2 minutes while Needs attention is open.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
    </AppShell>
  )
}
