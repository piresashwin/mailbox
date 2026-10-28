import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'

import { AppShell } from '#/components/AppShell'
import { formatCategory, formatRelativeTime } from '#/lib/format'
import { listDoneItems, type OpenItem } from '#/lib/mailbox'

export const Route = createFileRoute('/_authed/done')({
  component: DonePage,
  loader: async () => {
    try {
      return await listDoneItems()
    } catch {
      return [] as OpenItem[]
    }
  },
})

function DonePage() {
  const initial = Route.useLoaderData()
  const { data = initial } = useQuery({
    queryKey: ['done-items'],
    queryFn: () => listDoneItems(),
    initialData: initial,
  })

  return (
    <AppShell active="done">
      <h1 className="page-title">Done</h1>
      <p className="page-subtitle mb-5">Recently handled</p>
      <div className="feed">
        {data.length === 0 ? (
          <div className="feed-empty">
            <p className="text-sm font-medium text-[var(--color-muted)]">
              Nothing marked done yet.
            </p>
          </div>
        ) : (
          data.map((item) => (
            <article
              key={item.trackerId}
              className="feed-row feed-row-done-item"
            >
              <div className="feed-row-rail feed-row-rail-done" aria-hidden />
              <div className="feed-row-priority">
                <span className="priority-badge priority-badge-done">
                  <CircleCheck size={14} strokeWidth={2.25} aria-hidden />
                  <span>Done</span>
                </span>
              </div>
              <div className="feed-row-body">
                <h2 className="feed-row-subject">{item.subject}</h2>
                <p className="feed-row-meta">
                  <span className="feed-from">
                    {item.fromName || item.fromEmail}
                  </span>
                  <span> · {formatCategory(item.category)}</span>
                </p>
              </div>
              <span className="feed-row-time">
                {formatRelativeTime(item.receivedAt) || '—'}
              </span>
              <div className="w-[30px]" aria-hidden />
            </article>
          ))
        )}
      </div>
    </AppShell>
  )
}
