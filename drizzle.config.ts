import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { join } from 'node:path'

config({ path: ['.env.local', '.env'] })

const url =
  process.env.DATABASE_URL?.replace(/^file:/, '') ||
  join(process.cwd(), 'data', 'mailbox.sqlite')

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url,
  },
})
