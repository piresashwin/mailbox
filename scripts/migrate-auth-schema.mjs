/**
 * One-shot SQLite migration: accounts → mail_accounts + auth tables + user scoping.
 * Run: node scripts/migrate-auth-schema.mjs
 */
import Database from 'better-sqlite3'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: join(root, '.env.local') })
config({ path: join(root, '.env') })

const dataDir = join(root, 'data')
mkdirSync(dataDir, { recursive: true })
const dbPath =
  process.env.DATABASE_URL?.replace(/^file:/, '') ||
  join(dataDir, 'mailbox.sqlite')

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = OFF')

function tableExists(name) {
  return Boolean(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name),
  )
}

function columnExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)
}

db.exec(`
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  role_label TEXT,
  onboarding_completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mail_oauth_states (
  state TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`)

const now = Date.now()
let ownerId = db.prepare('SELECT id FROM user LIMIT 1').get()?.id
if (!ownerId) {
  ownerId = randomBytes(16).toString('hex')
  db.prepare(
    `INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(ownerId, 'Mailbox Owner', 'owner@local.dev', now, now)
  console.log('Created seed user', ownerId)
}

const profile = db.prepare('SELECT user_id FROM user_profiles WHERE user_id=?').get(ownerId)
if (!profile) {
  db.prepare(
    `INSERT INTO user_profiles (user_id, display_name, timezone, onboarding_completed_at, created_at, updated_at)
     VALUES (?, ?, 'UTC', ?, ?, ?)`,
  ).run(ownerId, 'Mailbox Owner', now, now, now)
}

if (tableExists('accounts') && !tableExists('mail_accounts')) {
  db.exec(`ALTER TABLE accounts RENAME TO mail_accounts`)
  console.log('Renamed accounts → mail_accounts')
}

if (tableExists('mail_accounts') && !columnExists('mail_accounts', 'user_id')) {
  db.exec(`ALTER TABLE mail_accounts ADD COLUMN user_id TEXT`)
  db.prepare(`UPDATE mail_accounts SET user_id = ? WHERE user_id IS NULL`).run(ownerId)
  console.log('Backfilled mail_accounts.user_id')
} else if (tableExists('mail_accounts')) {
  db.prepare(`UPDATE mail_accounts SET user_id = ? WHERE user_id IS NULL OR user_id = ''`).run(
    ownerId,
  )
}

if (tableExists('settings')) {
  if (!columnExists('settings', 'user_id')) {
    db.exec(`ALTER TABLE settings ADD COLUMN user_id TEXT`)
  }
  db.prepare(`UPDATE settings SET user_id = ? WHERE user_id IS NULL OR user_id = ''`).run(
    ownerId,
  )
  console.log('Backfilled settings.user_id')
}

if (tableExists('commitments')) {
  if (!columnExists('commitments', 'user_id')) {
    db.exec(`ALTER TABLE commitments ADD COLUMN user_id TEXT`)
  }
  // Backfill via mail account ownership
  db.prepare(
    `UPDATE commitments SET user_id = (
       SELECT ma.user_id FROM mail_accounts ma WHERE ma.id = commitments.account_id
     ) WHERE user_id IS NULL OR user_id = ''`,
  ).run()
  db.prepare(`UPDATE commitments SET user_id = ? WHERE user_id IS NULL OR user_id = ''`).run(
    ownerId,
  )
  console.log('Backfilled commitments.user_id')
}

db.pragma('foreign_keys = ON')
console.log('Migration complete. Owner userId:', ownerId)
db.close()
