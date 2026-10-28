/**
 * Maps stored classifier urgency (1–5) + category to UI priority bands.
 * Does not invent urgency from subject text — only structured fields.
 */
export type PriorityLevel = 'p1' | 'p2' | 'p3' | 'p4'

export type PriorityMeta = {
  level: PriorityLevel
  /** Sort key: higher first */
  rank: number
  label: string
  shortLabel: string
  /** Compact status from category when useful */
  actionLabel: string | null
}

const ACTION_CATEGORIES = new Set([
  'ActionRequired',
  'WaitingOnMe',
  'Deadline',
])

export function getPriority(urgency: number, category: string): PriorityMeta {
  const u = Math.min(5, Math.max(1, Math.round(urgency || 1)))
  const actionLabel = categoryActionLabel(category)

  if (u >= 5) {
    return {
      level: 'p1',
      rank: 40 + u,
      label: 'Urgent',
      shortLabel: 'P1',
      actionLabel,
    }
  }
  if (u >= 4) {
    return {
      level: 'p2',
      rank: 30 + u,
      label: 'High priority',
      shortLabel: 'P2',
      actionLabel,
    }
  }
  if (u >= 3 || ACTION_CATEGORIES.has(category)) {
    return {
      level: 'p3',
      rank: 20 + u,
      label: actionLabel || 'Action required',
      shortLabel: 'P3',
      actionLabel,
    }
  }
  return {
    level: 'p4',
    rank: 10 + u,
    label: 'Normal',
    shortLabel: 'P4',
    actionLabel: null,
  }
}

function categoryActionLabel(category: string): string | null {
  switch (category) {
    case 'ActionRequired':
      return 'Action needed'
    case 'WaitingOnMe':
      return 'Reply required'
    case 'Deadline':
      return 'Deadline'
    case 'Finance':
      return 'Finance'
    case 'People':
      return 'People'
    case 'FYIImportant':
      return 'FYI'
    default:
      return null
  }
}

export function compareByPriority(
  a: { urgency: number; category: string; receivedAt: string },
  b: { urgency: number; category: string; receivedAt: string },
): number {
  const pa = getPriority(a.urgency, a.category)
  const pb = getPriority(b.urgency, b.category)
  if (pb.rank !== pa.rank) return pb.rank - pa.rank
  return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
}
