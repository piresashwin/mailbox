import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Paperclip,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '#/components/ui/button'
import { formatCategory, formatRelativeTime } from '#/lib/format'
import {
  draftReplyWithAi,
  listCommitmentsForTracker,
  listThreadAttachments,
  sendReply,
  summarizeThread,
  updateCommitment,
  type OpenItem,
  type ThreadAttachment,
} from '#/lib/mailbox'
import { getPriority } from '#/lib/priority'

type AttachmentScope = 'thread' | 'message'

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentGroup(att: ThreadAttachment): 'documents' | 'images' | 'other' {
  const type = (att.contentType || '').toLowerCase()
  const name = att.name.toLowerCase()
  if (
    type.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)
  ) {
    return 'images'
  }
  if (
    type.includes('pdf') ||
    type.includes('word') ||
    type.includes('sheet') ||
    type.includes('presentation') ||
    type.includes('text') ||
    type.includes('msword') ||
    type.includes('officedocument') ||
    /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf)$/.test(name)
  ) {
    return 'documents'
  }
  return 'other'
}

const GROUP_LABELS = {
  documents: 'Documents',
  images: 'Images',
  other: 'Other',
} as const

export function ItemSidePanel({
  item,
  onClose,
  onDone,
  onSnooze,
}: {
  item: OpenItem
  onClose: () => void
  onDone: () => void
  onSnooze: () => void
}) {
  const priority = getPriority(item.urgency, item.category)
  const queryClient = useQueryClient()
  const isLive = item.trackerId > 0

  const [attachScope, setAttachScope] = useState<AttachmentScope>('thread')
  const [replyBody, setReplyBody] = useState('')
  const [sentBanner, setSentBanner] = useState(false)
  const [threadSummaryText, setThreadSummaryText] = useState<string | null>(
    null,
  )

  useEffect(() => {
    setReplyBody('')
    setSentBanner(false)
    setThreadSummaryText(null)
    setAttachScope('thread')
  }, [item.trackerId])

  const summaryMutation = useMutation({
    mutationFn: () => summarizeThread({ data: { trackerId: item.trackerId } }),
    onSuccess: (data) => {
      setThreadSummaryText(
        [data.summary, ...(data.bullets || [])].filter(Boolean).join('\n'),
      )
    },
  })

  const attachmentsQuery = useQuery({
    queryKey: ['thread-attachments', item.trackerId, attachScope],
    queryFn: () =>
      listThreadAttachments({
        data: { trackerId: item.trackerId, scope: attachScope },
      }),
    enabled: isLive,
  })

  const commitmentsQuery = useQuery({
    queryKey: ['tracker-commitments', item.trackerId],
    queryFn: () =>
      listCommitmentsForTracker({ data: { trackerId: item.trackerId } }),
    enabled: isLive,
  })

  const commitmentMutation = useMutation({
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
    onSuccess: () => {
      void commitmentsQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: ['commitments'] })
      void queryClient.invalidateQueries({ queryKey: ['morning-brief'] })
    },
  })

  const draftMutation = useMutation({
    mutationFn: () =>
      draftReplyWithAi({
        data: {
          trackerId: item.trackerId,
          threadSummary: threadSummaryText || undefined,
        },
      }),
    onSuccess: (data) => {
      setReplyBody(data.body)
    },
  })

  const sendMutation = useMutation({
    mutationFn: () =>
      sendReply({
        data: { trackerId: item.trackerId, body: replyBody.trim() },
      }),
    onSuccess: (data) => {
      setSentBanner(true)
      setReplyBody('')
      if (data.suggestedClearCount > 0) {
        void commitmentsQuery.refetch()
        void queryClient.invalidateQueries({ queryKey: ['morning-brief'] })
        void queryClient.invalidateQueries({ queryKey: ['commitments'] })
      }
    },
  })

  const grouped = useMemo(() => {
    const list = (attachmentsQuery.data || []).filter((a) => !a.isInline)
    const buckets: Record<'documents' | 'images' | 'other', ThreadAttachment[]> =
      {
        documents: [],
        images: [],
        other: [],
      }
    for (const a of list) buckets[attachmentGroup(a)].push(a)
    return buckets
  }, [attachmentsQuery.data])

  const attachmentCount = (attachmentsQuery.data || []).filter(
    (a) => !a.isInline,
  ).length

  const replySubject = item.subject.toLowerCase().startsWith('re:')
    ? item.subject
    : `Re: ${item.subject}`

  return (
    <aside className="item-panel" aria-label="Message detail">
      <header className="item-panel-header">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--color-muted)]">
            <span className={`status-chip status-chip-${priority.level}`}>
              {priority.label}
            </span>
            <span>{formatCategory(item.category)}</span>
          </p>
          <h2 className="mt-1 truncate text-[15px] font-semibold tracking-tight text-[var(--color-text)]">
            {item.subject}
          </h2>
          <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
            {item.fromName || item.fromEmail} · {item.fromEmail}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost shrink-0"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>

      <div className="item-panel-scroll">
        {isLive && (commitmentsQuery.data?.length || 0) > 0 ? (
          <section className="item-panel-section">
            <div className="flex items-center justify-between gap-2">
              <h3 className="item-panel-section-title">Commitments</h3>
              <span className="text-xs text-[var(--color-muted)]">
                {commitmentsQuery.data!.length}
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {commitmentsQuery.data!.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-priority-p2-bg)] p-3"
                >
                  <p className="text-[13px] font-medium text-[var(--color-text)]">
                    {c.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                    {c.dueKind === 'firm' && c.dueAt
                      ? `Due ${formatRelativeTime(c.dueAt)}`
                      : 'Open loop'}
                    {c.suggestedClear ? ' · Clear after reply?' : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      className="!h-7 !px-2 !text-xs"
                      onClick={() =>
                        commitmentMutation.mutate({
                          id: c.id,
                          status: 'done',
                        })
                      }
                    >
                      Done
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-7 !px-2 !text-xs"
                      onClick={() =>
                        commitmentMutation.mutate({
                          id: c.id,
                          status: 'snoozed',
                        })
                      }
                    >
                      Snooze
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-7 !px-2 !text-xs"
                      onClick={() =>
                        commitmentMutation.mutate({
                          id: c.id,
                          status: 'dismissed',
                        })
                      }
                    >
                      Not mine
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="item-panel-section">
          <div className="flex items-center justify-between gap-2">
            <h3 className="item-panel-section-title">Context</h3>
            {isLive ? (
              <Button
                type="button"
                variant="secondary"
                className="!h-8 !px-2.5 !text-xs"
                disabled={summaryMutation.isPending}
                onClick={() => summaryMutation.mutate()}
              >
                {summaryMutation.isPending
                  ? 'Reading thread…'
                  : summaryMutation.isSuccess
                    ? 'Refresh summary'
                    : 'Summarize thread'}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
            {item.reason || 'No classification reason.'}
          </p>
          <div className="mt-3 max-h-36 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-[13px] leading-relaxed text-[var(--color-text)]">
            {item.snippet || item.bodyText.slice(0, 500) || 'No preview.'}
          </div>
          {summaryMutation.isError ? (
            <p className="mt-2 text-xs text-[var(--color-urgent)]">
              Couldn’t summarize.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => summaryMutation.mutate()}
              >
                Retry
              </button>
            </p>
          ) : null}
          {summaryMutation.data ? (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Thread summary
                {summaryMutation.data.messageCount
                  ? ` · ${summaryMutation.data.messageCount} messages`
                  : ''}
              </p>
              {summaryMutation.data.participants ? (
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {summaryMutation.data.participants}
                </p>
              ) : null}
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text)]">
                {summaryMutation.data.summary}
              </p>
              {summaryMutation.data.bullets?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-[var(--color-text)]">
                  {summaryMutation.data.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {summaryMutation.data.singleMessage ? (
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  No other messages in this conversation.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="item-panel-section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="item-panel-section-title">
              Attachments
              {isLive && !attachmentsQuery.isLoading ? (
                <span className="ml-1.5 font-normal text-[var(--color-muted)]">
                  · {attachmentCount}
                </span>
              ) : null}
            </h3>
            {isLive ? (
              <div className="segmented" role="group" aria-label="Attachment scope">
                <button
                  type="button"
                  data-active={attachScope === 'thread'}
                  onClick={() => setAttachScope('thread')}
                >
                  Thread
                </button>
                <button
                  type="button"
                  data-active={attachScope === 'message'}
                  onClick={() => setAttachScope('message')}
                >
                  This email
                </button>
              </div>
            ) : null}
          </div>

          {!isLive ? (
            <p className="mt-3 text-[13px] text-[var(--color-muted)]">
              Connect Outlook to load attachments.
            </p>
          ) : attachmentsQuery.isLoading ? (
            <div className="mt-3 space-y-2" aria-busy="true">
              {[0, 1].map((i) => (
                <div key={i} className="sk h-10 w-full rounded-[var(--radius-md)]" />
              ))}
            </div>
          ) : attachmentsQuery.isError ? (
            <p className="mt-3 text-xs text-[var(--color-urgent)]">
              Couldn’t load attachments.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => void attachmentsQuery.refetch()}
              >
                Retry
              </button>
            </p>
          ) : attachmentCount === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--color-muted)]">
              No attachments
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {(['documents', 'images', 'other'] as const).map((key) => {
                const rows = grouped[key]
                if (!rows.length) return null
                return (
                  <div key={key}>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                      {GROUP_LABELS[key]}
                    </p>
                    <ul className="space-y-1.5">
                      {rows.map((att) => (
                        <li key={`${att.providerMessageId}-${att.id}`}>
                          <a
                            className="attachment-row"
                            href={`/api/attachments/download?accountId=${item.accountId}&providerMessageId=${encodeURIComponent(att.providerMessageId)}&attachmentId=${encodeURIComponent(att.id)}`}
                          >
                            <span className="attachment-icon" aria-hidden>
                              {key === 'images' ? (
                                <ImageIcon size={14} />
                              ) : key === 'documents' ? (
                                <FileText size={14} />
                              ) : (
                                <Paperclip size={14} />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-[var(--color-text)]">
                                {att.name}
                              </span>
                              <span className="block truncate text-[11px] text-[var(--color-muted)]">
                                {formatBytes(att.size)}
                                {attachScope === 'thread'
                                  ? ` · ${att.fromName || att.fromEmail} · ${formatRelativeTime(att.receivedAt)}`
                                  : ''}
                              </span>
                            </span>
                            <Download size={14} className="shrink-0 text-[var(--color-muted)]" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="item-panel-section">
          <h3 className="item-panel-section-title">Reply</h3>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            To: {item.fromName || item.fromEmail}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
            {replySubject}
          </p>
          <textarea
            className="reply-textarea mt-3"
            rows={6}
            placeholder="Write a reply…"
            value={replyBody}
            onChange={(e) => {
              setReplyBody(e.target.value)
              setSentBanner(false)
            }}
            disabled={!isLive}
          />
          {sentBanner ? (
            <p className="mt-2 text-xs font-medium text-[var(--color-completed)]">
              Sent
            </p>
          ) : null}
          {sendMutation.isError ? (
            <p className="mt-2 text-xs text-[var(--color-urgent)]">
              Couldn’t send. Reconnect Outlook if you recently added Mail.Send, then
              retry.
            </p>
          ) : null}
          {draftMutation.isError ? (
            <p className="mt-2 text-xs text-[var(--color-urgent)]">
              Couldn’t draft a reply. Try again.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!isLive || draftMutation.isPending}
              onClick={() => draftMutation.mutate()}
            >
              {draftMutation.isPending ? 'Drafting…' : 'Draft with AI'}
            </Button>
            <Button
              type="button"
              disabled={!isLive || !replyBody.trim() || sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </section>
      </div>

      <footer className="item-panel-footer">
        <Button type="button" onClick={onDone} disabled={!isLive}>
          Mark done
        </Button>
        <Button type="button" variant="secondary" onClick={onSnooze} disabled={!isLive}>
          Snooze 24h
        </Button>
        {item.webLink ? (
          <Button type="button" variant="secondary" asChild>
            <a href={item.webLink} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Outlook
            </a>
          </Button>
        ) : null}
      </footer>
    </aside>
  )
}
