import { relations, sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { user } from './auth'

export const userProfiles = sqliteTable('user_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  timezone: text('timezone').notNull().default('UTC'),
  roleLabel: text('role_label'),
  onboardingCompletedAt: integer('onboarding_completed_at', {
    mode: 'timestamp_ms',
  }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

/** Short-lived OAuth state for mail connector connect (CSRF). */
export const mailOauthStates = sqliteTable('mail_oauth_states', {
  state: text('state').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(user, {
    fields: [userProfiles.userId],
    references: [user.id],
  }),
}))

export type UserProfile = typeof userProfiles.$inferSelect
