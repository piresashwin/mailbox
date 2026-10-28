import { AlertTriangle, Check } from 'lucide-react'

import { formatRelativeTime } from '#/lib/format'
import { getPriority } from '#/lib/priority'
import type { OpenItem } from '#/lib/mailbox'

export function EmailRow({
  item,
  selected,
  onSelect,
  onDone,
}: {
  item: OpenItem
  selected?: boolean
  onSelect: () => void
  onDone?: () => void
}) {
  const priority = getPriority(item.urgency, item.category)
  const when = formatRelativeTime(item.receivedAt)
  const from = item.fromName || item.fromEmail
  const showDone = item.trackerId > 0 && onDone

  return (
    <article
      className="feed-row"
      data-priority={priority.level}
      data-selected={selected || undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${priority.label}: ${item.subject}`}
    >
      <div className="feed-row-rail" aria-hidden />
      <div className="feed-row-priority" title={priority.label}>
        {priority.level === 'p1' ? (
          <span className="priority-badge priority-badge-p1">
            <AlertTriangle size={12} strokeWidth={2.4} aria-hidden />
            <span>Urgent</span>
          </span>
        ) : priority.level === 'p2' ? (
          <span className="priority-badge priority-badge-p2">
            <span className="feed-row-dot" aria-hidden />
            <span>High</span>
          </span>
        ) : priority.level === 'p3' ? (
          <span className="priority-badge priority-badge-p3">
            <span className="feed-row-dot" aria-hidden />
            <span className="sr-only">{priority.label}</span>
          </span>
        ) : (
          <span className="priority-badge priority-badge-p4">
            <span className="feed-row-dot" aria-hidden />
            <span className="sr-only">Normal</span>
          </span>
        )}
      </div>

      <div className="feed-row-body">
        <div className="feed-row-subject-line">
          <h3 className="feed-row-subject">{item.subject}</h3>
          {priority.actionLabel && priority.level !== 'p4' ? (
            <span className={`status-chip status-chip-${priority.level}`}>
              {priority.actionLabel}
            </span>
          ) : null}
        </div>
        <p className="feed-row-meta">
          <span className="feed-from">{from}</span>
          {item.reason ? <span> · {item.reason}</span> : null}
        </p>
      </div>

      <span className="feed-row-time">{when || '—'}</span>

      {showDone ? (
        <div className="feed-row-done" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn-ghost"
            aria-label="Mark done"
            title="Mark done"
            onClick={onDone}
          >
            <Check size={16} strokeWidth={2.25} />
          </button>
        </div>
      ) : (
        <div className="w-[30px]" />
      )}
    </article>
  )
}
