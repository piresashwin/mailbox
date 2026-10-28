import type { OpenItem } from '#/lib/mailbox'

/** Fallback UI samples when DB is empty (design prototype copy). */
export const MOCK_OPEN_ITEMS: OpenItem[] = [
  {
    trackerId: -1,
    messageId: -1,
    accountId: -1,
    providerMessageId: 'mock-1',
    threadId: 'mock-thread-1',
    subject: 'Need your sign-off on the Q3 board pack by Thu',
    fromName: 'Maya Chen',
    fromEmail: 'maya.chen@contoso.com',
    snippet: 'Asks for a decision with a Thursday deadline.',
    bodyText:
      'Hi — attaching the latest board pack. Please confirm the revenue slide and the risk callouts before Thursday’s rehearsal.',
    webLink: null,
    provider: 'outlook',
    accountEmail: 'ashwin@contoso.com',
    category: 'ActionRequired',
    urgency: 5,
    reason: 'Asks for a decision with a Thursday deadline.',
    receivedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    status: 'open',
  },
  {
    trackerId: -2,
    messageId: -2,
    accountId: -1,
    providerMessageId: 'mock-2',
    threadId: 'mock-thread-2',
    subject: 'Vendor invoice #4412 needs approval',
    fromName: 'Finance',
    fromEmail: 'finance@contoso.com',
    snippet: 'Payment blocked until you approve in the portal.',
    bodyText: 'Payment blocked until you approve in the portal.',
    webLink: null,
    provider: 'outlook',
    accountEmail: 'ashwin@contoso.com',
    category: 'Finance',
    urgency: 4,
    reason: 'Payment blocked until you approve in the portal.',
    receivedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    status: 'open',
  },
  {
    trackerId: -3,
    messageId: -3,
    accountId: -1,
    providerMessageId: 'mock-3',
    threadId: null,
    subject: 'Can we move Friday’s intro call?',
    fromName: 'Jordan Lee',
    fromEmail: 'jordan.lee@contoso.com',
    snippet: 'Waiting on your reply to reschedule.',
    bodyText: 'Waiting on your reply to reschedule.',
    webLink: null,
    provider: 'outlook',
    accountEmail: 'ashwin@contoso.com',
    category: 'WaitingOnMe',
    urgency: 3,
    reason: 'Waiting on your reply to reschedule.',
    receivedAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
    status: 'open',
  },
]

export function groupByCategory(items: OpenItem[]) {
  const map = new Map<string, OpenItem[]>()
  for (const item of items) {
    const list = map.get(item.category) || []
    list.push(item)
    map.set(item.category, list)
  }
  return [...map.entries()]
}
