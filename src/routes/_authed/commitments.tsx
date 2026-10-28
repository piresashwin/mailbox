import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { AppShell } from '#/components/AppShell'
import { Button } from '#/components/ui/button'
import { formatRelativeTime } from '#/lib/format'
import {
  confirmSuggestedClears,
  dismissSuggestedClears,
  listCommitments,
  updateCommitment,
  type CommitmentItem,
} from '#/lib/mailbox'

type Filter = 'all' | 'overdue' | 'due_soon' | 'open_loops'

export const Route = createFileRoute('/_authed/commitments')({
  component: CommitmentsPage,
  loader: async () => {
    try {
      return await listCommitments({ data: { filter: 'all' } })
    } catch {
      return [] as CommitmentItem[]
    }
  },
})

function dueLabel(item: CommitmentItem) {
  if (item.dueKind === 'firm' && item.dueAt) {
    const due = new Date(item.dueAt).getTime()
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (due < start.getTime()) {
      const days = Math.max(
        1,
        Math.round((start.getTime() - due) / 86400_000),
      )
      return `${days}d overdue`
    }
    return `Due ${formatRelativeTime(item.dueAt).replace(' ago', '') || 'soon'}`
  }
  const ageMs = Date.now() - new Date(item.receivedAt).getTime()
  const days = Math.max(0, Math.round(ageMs / 86400_000))
  return days ? `Open ${days}d · No due date` : 'Open loop · No due date'
}

function railClass(item: CommitmentItem) {
  if (item.dueKind === 'firm' && item.dueAt) {
    const due = new Date(item.dueAt).getTime()
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (due < start.getTime()) return 'bg-[var(--color-priority-p1)]'
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    if (due <= end.getTime() + 3 * 86400_000)
      return 'bg-[var(--color-priority-p2)]'
  }
  return 'bg-[var(--color-priority-p4)]'
}

function CommitmentsPage() {
  const initial = Route.useLoaderData()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')

  const { data: items = initial } = useQuery({
    queryKey: ['commitments', filter],
    queryFn: () => listCommitments({ data: { filter } }),
    initialData: filter === 'all' ? initial : undefined,
  })

  const suggested = useMemo(
    () => items.filter((i) => i.suggestedClear),
    [items],
  )

  const groups = useMemo(() => {
    if (filter !== 'all') return [['__flat__', items] as const]
    const overdue: CommitmentItem[] = []
    const soon: CommitmentItem[] = []
    const loops: CommitmentItem[] = []
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const soonEnd = start.getTime() + 4 * 86400_000
    for (const item of items) {
      const due = item.dueAt ? new Date(item.dueAt).getTime() : null
      if (item.dueKind === 'firm' && due != null && due < start.getTime()) {
        overdue.push(item)
      } else if (
        item.dueKind === 'firm' &&
        due != null &&
        due <= soonEnd
      ) {
        soon.push(item)
      } else {
        loops.push(item)
      }
    }
    return [
      ['Overdue', overdue],
      ['Due soon', soon],
      ['Open loops', loops],
    ] as const
  }, [items, filter])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['commitments'] })
    queryClient.invalidateQueries({ queryKey: ['morning-brief'] })
    queryClient.invalidateQueries({ queryKey: ['tracker-commitments'] })
  }

  const updateMutation = useMutation({
    mutationFn: (input: {
      id: number
      status: 'done' | 'snoozed' | 'dismissed'
    }) =>
      updateCommitment({
        data: {
          id: input.id,
          status: input.status,
          snoozeHours: input.status === 'snoozed' ? 24 : undefined,
        },
      }),
    onSuccess: invalidate,
  })

  const clearMutation = useMutation({
    mutationFn: () => confirmSuggestedClears({ data: {} }),
    onSuccess: invalidate,
  })

  const dismissMutation = useMutation({
    mutationFn: () => dismissSuggestedClears(),
    onSuccess: invalidate,
  })

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'due_soon', label: 'Due soon' },
    { id: 'open_loops', label: 'Open loops' },
  ]

  return (
    <AppShell active="commitments" commitmentsCount={items.length}>
      <div className="mb-5">
        <h1 className="page-title">Commitments</h1>
        <p className="page-subtitle">
          What you owe · {items.length} open
        </p>
      </div>

      {suggested.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-accent-soft)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Looks like you replied
            </p>
            <p className="text-[13px] text-[var(--color-muted)]">
              Clear {suggested.length} open commitment
              {suggested.length === 1 ? '' : 's'}? You can undo by reopening.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending}
            >
              Keep open
            </Button>
            <Button
              type="button"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
            >
              Clear {suggested.length}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="segmented mb-4">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            data-active={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="feed">
          <div className="feed-empty">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              No open commitments
            </p>
            <p className="mt-1 text-[13px] text-[var(--color-muted)]">
              Sync mail and we’ll extract asks directed at you.
            </p>
            <Button asChild className="mt-4" variant="secondary">
              <Link to="/">Back to inbox</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="feed">
          {groups.map(([label, list]) => {
            if (!list.length) return null
            return (
              <section key={label}>
                {filter === 'all' ? (
                  <div className="feed-section-label pointer-events-none">
                    <span>{label}</span>
                    <span className="feed-section-count">{list.length}</span>
                  </div>
                ) : null}
                {list.map((item) => (
                  <div key={item.id} className="commitment-row">
                    <div
                      className={`commitment-rail ${railClass(item)}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--color-text)]">
                        {item.title}
                      </p>
                      <p className="truncate text-[12px] text-[var(--color-muted)]">
                        {item.fromName || item.fromEmail} · {dueLabel(item)}
                      </p>
                    </div>
                    <div className="commitment-row-actions">
                      <Button
                        type="button"
                        className="!h-8 !px-2.5 !text-xs"
                        onClick={() =>
                          updateMutation.mutate({
                            id: item.id,
                            status: 'done',
                          })
                        }
                      >
                        Done
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!h-8 !px-2.5 !text-xs"
                        onClick={() =>
                          updateMutation.mutate({
                            id: item.id,
                            status: 'snoozed',
                          })
                        }
                      >
                        Snooze
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!h-8 !px-2.5 !text-xs"
                        onClick={() =>
                          updateMutation.mutate({
                            id: item.id,
                            status: 'dismissed',
                          })
                        }
                      >
                        Not mine
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
