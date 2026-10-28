import { relations, sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { user } from './auth'

/** Connected mailboxes (Outlook/Gmail) — not Better Auth identities. */
export const mailAccounts = sqliteTable(
  'mail_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // outlook | gmail
    email: text('email').notNull(),
    displayName: text('display_name'),
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    expiresAt: integer('expires_at'), // unix ms
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('mail_accounts_user_provider_email').on(
      t.userId,
      t.provider,
      t.email,
    ),
  ],
)

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    providerMessageId: text('provider_message_id').notNull(),
    threadId: text('thread_id'),
    subject: text('subject').notNull().default(''),
    fromName: text('from_name'),
    fromEmail: text('from_email').notNull(),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
    snippet: text('snippet').notNull().default(''),
    bodyText: text('body_text').notNull().default(''),
    webLink: text('web_link'),
    folder: text('folder'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('messages_account_provider_uid').on(
      t.accountId,
      t.providerMessageId,
    ),
  ],
)

export const classifications = sqliteTable('classifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  messageId: integer('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' })
    .unique(),
  important: integer('important', { mode: 'boolean' }).notNull(),
  urgency: integer('urgency').notNull().default(1),
  category: text('category').notNull(),
  reason: text('reason').notNull(),
  model: text('model').notNull(),
  classifiedAt: integer('classified_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const trackerItems = sqliteTable('tracker_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  messageId: integer('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' })
    .unique(),
  status: text('status').notNull().default('open'),
  category: text('category').notNull(),
  urgency: integer('urgency').notNull().default(1),
  note: text('note'),
  snoozedUntil: integer('snoozed_until', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const syncState = sqliteTable('sync_state', {
  accountId: integer('account_id')
    .primaryKey()
    .references(() => mailAccounts.id, { onDelete: 'cascade' }),
  cursor: text('cursor'),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp_ms' }),
})

export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    openaiModel: text('openai_model').notNull().default('gpt-5.6-luna'),
    pollIntervalSec: integer('poll_interval_sec').notNull().default(120),
  },
  (t) => [uniqueIndex('settings_user_id').on(t.userId)],
)

export const commitments = sqliteTable(
  'commitments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trackerItemId: integer('tracker_item_id').references(() => trackerItems.id, {
      onDelete: 'set null',
    }),
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    accountId: integer('account_id')
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    threadId: text('thread_id'),
    direction: text('direction').notNull().default('i_owe'),
    title: text('title').notNull(),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }),
    dueKind: text('due_kind').notNull().default('none'),
    confidence: integer('confidence').notNull().default(70),
    status: text('status').notNull().default('open'),
    snoozedUntil: integer('snoozed_until', { mode: 'timestamp_ms' }),
    fingerprint: text('fingerprint').notNull(),
    source: text('source').notNull().default('ai'),
    suggestedClear: integer('suggested_clear', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('commitments_account_fingerprint').on(
      t.accountId,
      t.fingerprint,
    ),
  ],
)

export const mailAccountsRelations = relations(mailAccounts, ({ one, many }) => ({
  user: one(user, {
    fields: [mailAccounts.userId],
    references: [user.id],
  }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  account: one(mailAccounts, {
    fields: [messages.accountId],
    references: [mailAccounts.id],
  }),
}))

/** @deprecated Use MailAccount — kept as alias during refactor */
export type Account = typeof mailAccounts.$inferSelect
export type MailAccount = typeof mailAccounts.$inferSelect
export type TrackerItem = typeof trackerItems.$inferSelect
export type Message = typeof messages.$inferSelect
export type Classification = typeof classifications.$inferSelect
export type Commitment = typeof commitments.$inferSelect
