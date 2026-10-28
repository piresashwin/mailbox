import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AppShell } from '#/components/AppShell'
import { EmailRow } from '#/components/EmailRow'
import { ItemSidePanel } from '#/components/ItemSidePanel'
import { Button } from '#/components/ui/button'
import { formatCategory, formatRelativeTime } from '#/lib/format'
import {
  confirmSuggestedClears,
  dismissSuggestedClears,
  getMorningBrief,
  listCommitments,
  listConnections,
  listOpenItems,
  markDone,
  runSync,
  snoozeItem,
  type OpenItem,
} from '#/lib/mailbox'
import { MOCK_OPEN_ITEMS, groupByCategory } from '#/lib/mock-data'
import {
  compareByPriority,
  getPriority,
  type PriorityLevel,
} from '#/lib/priority'

type SortMode = 'priority' | 'newest' | 'category'
type PriorityFilter = 'all' | PriorityLevel

export const Route = createFileRoute('/_authed/')({
  component: NeedsAttentionPage,
  loader: async () => {
    try {
      const [items, connections] = await Promise.all([
        listOpenItems(),
        listConnections(),
      ])
      return { items, connections }
    } catch {
      return { items: [] as OpenItem[], connections: [] }
    }
  },
})

function sortItems(items: OpenItem[], mode: SortMode): OpenItem[] {
  const next = [...items]
  if (mode === 'newest') {
    next.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )
  } else {
    next.sort(compareByPriority)
  }
  return next
}

function NeedsAttentionPage() {
  const initial = Route.useLoaderData()
  const queryClient = useQueryClient()
  const { data: itemsData = initial.items, isFetching, isError, refetch } =
    useQuery({
      queryKey: ['open-items'],
      queryFn: () => listOpenItems(),
      initialData: initial.items,
      refetchInterval: 120_000,
    })
  const { data: connections = initial.connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => listConnections(),
    initialData: initial.connections,
  })

  const { data: brief } = useQuery({
    queryKey: ['morning-brief'],
    queryFn: () => getMorningBrief(),
    enabled: connections.length > 0,
    refetchInterval: 120_000,
  })

  const { data: openCommitments = [] } = useQuery({
    queryKey: ['commitments', 'all'],
    queryFn: () => listCommitments({ data: { filter: 'all' } }),
    enabled: connections.length > 0,
    refetchInterval: 120_000,
  })

  const hasConnection = connections.length > 0
  const isSample = !hasConnection && itemsData.length === 0
  const items = isSample ? MOCK_OPEN_ITEMS : itemsData
  const showSkeleton = isFetching && itemsData.length === 0 && hasConnection

  const [sort, setSort] = useState<SortMode>('priority')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [selected, setSelected] = useState<OpenItem | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const filtered = useMemo(() => {
    if (priorityFilter === 'all') return items
    return items.filter(
      (item) => getPriority(item.urgency, item.category).level === priorityFilter,
    )
  }, [items, priorityFilter])

  const sorted = useMemo(() => sortItems(filtered, sort), [filtered, sort])
  const groups = useMemo(() => {
    if (sort !== 'category') return [['__all__', sorted] as const]
    return groupByCategory(sorted)
  }, [sorted, sort])

  const connectionLastSync = useMemo(() => {
    const times = connections
      .map((c) => c.lastSyncAt)
      .filter((t): t is string => Boolean(t))
      .map((t) => new Date(t).getTime())
    if (!times.length) return null
    return new Date(Math.max(...times))
  }, [connections])

  const syncDisplay = lastSyncedAt || connectionLastSync

  const syncMutation = useMutation({
    mutationFn: () => runSync(),
    onSuccess: () => {
      setLastSyncedAt(new Date())
      queryClient.invalidateQueries({ queryKey: ['open-items'] })
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['morning-brief'] })
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
    },
  })

  const doneMutation = useMutation({
    mutationFn: (trackerId: number) => markDone({ data: { trackerId } }),
    onSuccess: (_data, trackerId) => {
      if (selected?.trackerId === trackerId) setSelected(null)
      queryClient.invalidateQueries({ queryKey: ['open-items'] })
      queryClient.invalidateQueries({ queryKey: ['done-items'] })
    },
  })

  const snoozeMutation = useMutation({
    mutationFn: (trackerId: number) => snoozeItem({ data: { trackerId, hours: 24 } }),
    onSuccess: (_data, trackerId) => {
      if (selected?.trackerId === trackerId) setSelected(null)
      queryClient.invalidateQueries({ queryKey: ['open-items'] })
    },
  })

  const clearSuggestedMutation = useMutation({
    mutationFn: () => confirmSuggestedClears({ data: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['morning-brief'] })
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
      queryClient.invalidateQueries({ queryKey: ['tracker-commitments'] })
    },
  })

  const dismissSuggestedMutation = useMutation({
    mutationFn: () => dismissSuggestedClears(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['morning-brief'] })
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
      queryClient.invalidateQueries({ queryKey: ['tracker-commitments'] })
    },
  })

  const briefTotal =
    (brief?.overdueCount || 0) +
    (brief?.dueTodayCount || 0) +
    (brief?.agingCount || 0)
  const suggestedClear = brief?.suggestedClear || []

  useEffect(() => {
    if (!hasConnection) return
    const id = window.setInterval(() => {
      void syncMutation.mutateAsync().catch(() => undefined)
    }, 120_000)
    return () => window.clearInterval(id)
  }, [hasConnection])

  const sortLabel =
    sort === 'priority'
      ? 'Sorted by priority'
      : sort === 'newest'
        ? 'Sorted by newest'
        : 'Grouped by category'

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const showList = !isSample && !showSkeleton && !isError && sorted.length > 0

  return (
    <AppShell
      active="attention"
      attentionCount={isSample ? undefined : itemsData.length}
      commitmentsCount={
        isSample || !hasConnection ? undefined : openCommitments.length
      }
    >
      <div className="attention-split" data-panel-open={!!selected}>
        <div className="attention-feed">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="page-title">Needs attention</h1>
              <p className="page-subtitle">
                {isSample
                  ? 'Sample preview — connect Outlook to sync live mail'
                  : `${filtered.length} open · ${sortLabel}`}
                {syncDisplay && !isSample ? (
                  <span>
                    {' '}
                    · Synced {formatRelativeTime(syncDisplay.toISOString())}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="sort-mode">
                Group / sort
              </label>
              <select
                id="sort-mode"
                className="toolbar-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
              >
                <option value="priority">Priority</option>
                <option value="category">Category</option>
                <option value="newest">Newest</option>
              </select>
              <label className="sr-only" htmlFor="priority-filter">
                Priority filter
              </label>
              <select
                id="priority-filter"
                className="toolbar-select"
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value as PriorityFilter)
                }
              >
                <option value="all">All priorities</option>
                <option value="p1">Urgent</option>
                <option value="p2">High priority</option>
                <option value="p3">Action required</option>
                <option value="p4">Normal</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || !hasConnection}
                title={
                  !hasConnection ? 'Connect an account to sync' : 'Sync mail now'
                }
              >
                <RefreshCw
                  size={14}
                  className={syncMutation.isPending ? 'animate-spin' : undefined}
                />
                {syncMutation.isPending
                  ? 'Syncing…'
                  : syncMutation.isError
                    ? 'Retry sync'
                    : 'Sync now'}
              </Button>
            </div>
          </div>

          {!isSample && hasConnection && suggestedClear.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-accent-soft)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  Looks like you replied
                </p>
                <p className="text-[13px] text-[var(--color-muted)]">
                  Clear {suggestedClear.length} open commitment
                  {suggestedClear.length === 1 ? '' : 's'}?
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => dismissSuggestedMutation.mutate()}
                  disabled={dismissSuggestedMutation.isPending}
                >
                  Keep open
                </Button>
                <Button
                  type="button"
                  onClick={() => clearSuggestedMutation.mutate()}
                  disabled={clearSuggestedMutation.isPending}
                >
                  Clear {suggestedClear.length}
                </Button>
              </div>
            </div>
          ) : null}

          {!isSample && hasConnection && brief && briefTotal > 0 ? (
            <div className="brief-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    Morning brief
                  </p>
                  <p className="text-[13px] text-[var(--color-muted)]">
                    What you still owe before it slips
                  </p>
                </div>
                <Button asChild variant="secondary" className="!h-8 !px-3 !text-xs">
                  <Link to="/commitments">View all</Link>
                </Button>
              </div>
              <div className="brief-stats">
                <div className="brief-stat brief-stat-over">
                  <div className="text-lg font-semibold leading-none">
                    {brief.overdueCount}
                  </div>
                  <div className="mt-1 text-[11px] font-medium opacity-80">
                    Overdue
                  </div>
                </div>
                <div className="brief-stat brief-stat-today">
                  <div className="text-lg font-semibold leading-none">
                    {brief.dueTodayCount}
                  </div>
                  <div className="mt-1 text-[11px] font-medium opacity-80">
                    Due today
                  </div>
                </div>
                <div className="brief-stat brief-stat-aging">
                  <div className="text-lg font-semibold leading-none">
                    {brief.agingCount}
                  </div>
                  <div className="mt-1 text-[11px] font-medium opacity-80">
                    Aging loops
                  </div>
                </div>
              </div>
              {brief.highlights.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {brief.highlights.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-baseline justify-between gap-3 text-[13px]"
                    >
                      <span className="min-w-0 truncate font-medium text-[var(--color-text)]">
                        {h.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--color-muted)]">
                        {h.dueKind === 'firm' && h.dueAt
                          ? formatRelativeTime(h.dueAt)
                          : 'Open loop'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {isError ? (
            <div className="feed">
              <div className="feed-empty">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Couldn’t load your queue
                </p>
                <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                  Check your connection and try again.
                </p>
                <Button
                  type="button"
                  className="mt-4"
                  variant="secondary"
                  onClick={() => void refetch()}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : showSkeleton ? (
            <div className="feed" aria-busy="true" aria-label="Loading">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="feed-skeleton-row">
                  <div className="sk h-2 w-2 rounded-full" />
                  <div className="flex flex-col gap-2">
                    <div className="sk h-3.5 w-[70%]" />
                    <div className="sk h-3 w-[45%]" />
                  </div>
                  <div className="sk ml-auto h-3 w-10" />
                </div>
              ))}
            </div>
          ) : !isSample && items.length === 0 ? (
            <div className="feed">
              <div className="feed-empty">
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  You’re clear
                </p>
                <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                  No open items need attention. Sync to check for new mail.
                </p>
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  <RefreshCw size={14} />
                  Sync now
                </Button>
              </div>
            </div>
          ) : isSample ? (
            <div className="feed">
              <div className="feed-empty">
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  Connect Outlook to get started
                </p>
                <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                  Mailbox will classify new mail and surface only what needs you.
                </p>
                <Button asChild className="mt-4">
                  <Link to="/connections/add">Add connector</Link>
                </Button>
              </div>
            </div>
          ) : !showList ? (
            <div className="feed">
              <div className="feed-empty">
                <p className="text-sm font-medium text-[var(--color-muted)]">
                  No messages match this priority filter.
                </p>
              </div>
            </div>
          ) : (
            <div className="feed">
              {groups.map(([category, list]) => {
                const key = category
                const isCollapsed = sort === 'category' && collapsed.has(key)
                const showHeader = sort === 'category'
                return (
                  <section key={key}>
                    {showHeader ? (
                      <button
                        type="button"
                        className="feed-section-label"
                        onClick={() => toggleCollapsed(key)}
                        aria-expanded={!isCollapsed}
                      >
                        {isCollapsed ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                        <span>{formatCategory(category)}</span>
                        <span className="feed-section-count">{list.length}</span>
                      </button>
                    ) : null}
                    {isCollapsed
                      ? null
                      : list.map((item) => (
                          <EmailRow
                            key={item.trackerId}
                            item={item}
                            selected={selected?.trackerId === item.trackerId}
                            onSelect={() => setSelected(item)}
                            onDone={
                              item.trackerId > 0
                                ? () => doneMutation.mutate(item.trackerId)
                                : undefined
                            }
                          />
                        ))}
                  </section>
                )
              })}
            </div>
          )}
        </div>

        {selected ? (
          <ItemSidePanel
            item={selected}
            onClose={() => setSelected(null)}
            onDone={() =>
              selected.trackerId > 0 && doneMutation.mutate(selected.trackerId)
            }
            onSnooze={() =>
              selected.trackerId > 0 && snoozeMutation.mutate(selected.trackerId)
            }
          />
        ) : null}
      </div>
    </AppShell>
  )
}
