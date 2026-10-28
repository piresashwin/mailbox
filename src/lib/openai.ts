import OpenAI from 'openai'

import { DEFAULT_OPENAI_MODEL } from '#/lib/openai-model'

export const CATEGORIES = [
  'ActionRequired',
  'Deadline',
  'WaitingOnMe',
  'Finance',
  'People',
  'FYIImportant',
  'Other',
] as const

export type Category = (typeof CATEGORIES)[number]

export type ClassificationResult = {
  important: boolean
  urgency: number
  category: Category
  reason: string
}

const system = `You classify inbound email for a personal attention tracker.
Return JSON only: { "important": boolean, "urgency": 1-5, "category": one of ${CATEGORIES.join('|')}, "reason": short sentence }.
Mark important=true only if the recipient likely needs to act, reply, decide, or track a real obligation.
Skip newsletters, marketing, automated receipts, and pure FYI noise unless action is required.`

export async function classifyMessage(input: {
  subject: string
  from: string
  bodyText: string
  model?: string
}): Promise<ClassificationResult & { model: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === '...') {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  const model = input.model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
  const client = new OpenAI({ apiKey })
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          subject: input.subject,
          from: input.from,
          body: input.bodyText.slice(0, 3500),
        }),
      },
    ],
  })
  const raw = completion.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw) as Partial<ClassificationResult>
  const category = CATEGORIES.includes(parsed.category as Category)
    ? (parsed.category as Category)
    : 'Other'
  const urgency = Math.min(5, Math.max(1, Number(parsed.urgency) || 1))
  return {
    important: Boolean(parsed.important),
    urgency,
    category,
    reason: String(parsed.reason || 'No reason provided'),
    model,
  }
}

export type ThreadSummaryResult = {
  summary: string
  bullets: string[]
  messageCount: number
  participants: string
}

const summarySystem = `You summarize an email conversation for a busy professional.
Return JSON only: { "summary": "2-4 sentences", "bullets": ["short point", ...], "participants": "comma-separated names/emails", "messageCount": number }.
Focus on decisions, asks, open questions, and deadlines. Do not invent facts not in the transcript.`

export async function summarizeThreadTranscript(input: {
  transcript: string
  messageCount: number
  model?: string
}): Promise<ThreadSummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === '...') {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  const model = input.model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
  const client = new OpenAI({ apiKey })
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: summarySystem },
      {
        role: 'user',
        content: JSON.stringify({
          messageCount: input.messageCount,
          transcript: input.transcript.slice(0, 12000),
        }),
      },
    ],
  })
  const raw = completion.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw) as Partial<ThreadSummaryResult>
  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.map((b) => String(b)).filter(Boolean).slice(0, 8)
    : []
  return {
    summary: String(parsed.summary || 'No summary available.'),
    bullets,
    messageCount: Number(parsed.messageCount) || input.messageCount,
    participants: String(parsed.participants || ''),
  }
}

export type ExtractedCommitment = {
  direction: 'i_owe' | 'they_owe'
  title: string
  dueAt: string | null
  dueKind: 'firm' | 'soft' | 'none'
  confidence: number
}

const extractSystem = `You extract actionable commitments from an email directed at the recipient.
Return JSON only: { "commitments": [ { "direction": "i_owe"|"they_owe", "title": "short action", "dueAt": "ISO date or null", "dueKind": "firm"|"soft"|"none", "confidence": 0-1 } ] }.
Rules:
- Only include asks clearly directed at the recipient (you / please / need your).
- Prefer direction i_owe for things the recipient must do.
- Max 3 commitments. Skip FYI noise and quoted history.
- dueKind firm = explicit calendar date/deadline; soft = vague timing; none = no timing.
- Resolve relative dates (e.g. Friday) using the email receivedAt as reference; return ISO date when possible.
- confidence is 0-1; omit weak guesses below 0.55 by not including them.`

export async function extractCommitmentsFromMessage(input: {
  subject: string
  from: string
  bodyText: string
  receivedAt: string
  model?: string
}): Promise<ExtractedCommitment[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === '...') {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  const model = input.model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
  const client = new OpenAI({ apiKey })
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: extractSystem },
      {
        role: 'user',
        content: JSON.stringify({
          subject: input.subject,
          from: input.from,
          receivedAt: input.receivedAt,
          body: input.bodyText.slice(0, 3500),
        }),
      },
    ],
  })
  const raw = completion.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw) as { commitments?: Partial<ExtractedCommitment>[] }
  const list = Array.isArray(parsed.commitments) ? parsed.commitments : []
  return list
    .map((c): ExtractedCommitment | null => {
      const direction: ExtractedCommitment['direction'] =
        c.direction === 'they_owe' ? 'they_owe' : 'i_owe'
      const dueKind: ExtractedCommitment['dueKind'] =
        c.dueKind === 'firm' || c.dueKind === 'soft' ? c.dueKind : 'none'
      const confidence = Math.min(1, Math.max(0, Number(c.confidence) || 0))
      const title = String(c.title || '').trim()
      if (!title || confidence < 0.55) return null
      let dueAt: string | null = null
      if (c.dueAt) {
        const d = new Date(String(c.dueAt))
        if (!Number.isNaN(d.getTime())) dueAt = d.toISOString()
      }
      return { direction, title, dueAt, dueKind, confidence }
    })
    .filter((c): c is ExtractedCommitment => c != null)
    .slice(0, 3)
}

const draftSystem = `You draft a concise email reply as the mailbox owner.
Return JSON only: { "body": "plain text reply" }.
Be direct and professional. Do not include a subject line. Do not invent commitments the user did not imply.`

export async function draftReplyText(input: {
  subject: string
  from: string
  bodyText: string
  threadSummary?: string
  model?: string
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === '...') {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  const model = input.model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
  const client = new OpenAI({ apiKey })
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: draftSystem },
      {
        role: 'user',
        content: JSON.stringify({
          subject: input.subject,
          from: input.from,
          body: input.bodyText.slice(0, 3500),
          threadSummary: input.threadSummary || undefined,
        }),
      },
    ],
  })
  const raw = completion.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw) as { body?: string }
  return String(parsed.body || '').trim()
}
