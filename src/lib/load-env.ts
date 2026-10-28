import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'

let loaded = false

function applyParsed(parsed: Record<string, string>, overrideEmpty: boolean) {
  for (const [key, value] of Object.entries(parsed)) {
    if (!key) continue
    const current = process.env[key]
    const missing = current === undefined
    const empty = current === '' || current === '...'
    if (missing || (overrideEmpty && empty)) {
      process.env[key] = value
    }
  }
}

/**
 * Ensure .env.local / .env are applied into process.env.
 * Vite's loadEnv can leave empty shell/IDE values winning over file values;
 * we re-apply file values when the current value is missing or empty.
 */
export function ensureEnv() {
  if (loaded) return
  loaded = true

  const root = process.cwd()
  const localPath = resolve(root, '.env.local')
  const envPath = resolve(root, '.env')

  if (existsSync(envPath)) {
    applyParsed(parse(readFileSync(envPath, 'utf8')), false)
  }
  if (existsSync(localPath)) {
    // Local wins, including over empty placeholders already in process.env
    applyParsed(parse(readFileSync(localPath, 'utf8')), true)
  }
}
