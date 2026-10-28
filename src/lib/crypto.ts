import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import { ensureEnv } from '#/lib/load-env'

function keyFromSecret() {
  ensureEnv()
  const secret = process.env.TOKEN_SECRET
  if (!secret || secret === '...' || secret.length < 8) {
    throw new Error('TOKEN_SECRET must be set to a strong value in .env.local')
  }
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64url')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
