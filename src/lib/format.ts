export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.round((Date.now() - then) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

import { getPriority } from '#/lib/priority'

/** Prefer priority band labels derived from urgency + category. */
export function urgencyLabel(urgency: number, category = 'Other'): string {
  return getPriority(urgency, category).label
}

export function urgencyColor(urgency: number, category = 'Other'): string {
  const level = getPriority(urgency, category).level
  return `var(--color-priority-${level})`
}

export function formatCategory(category: string): string {
  return category.replace(/([a-z])([A-Z])/g, '$1 $2')
}
