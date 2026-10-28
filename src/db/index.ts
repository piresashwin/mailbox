import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as schema from './schema.ts'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../../data')
mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.DATABASE_URL?.replace(/^file:/, '') || join(dataDir, 'mailbox.sqlite')

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
