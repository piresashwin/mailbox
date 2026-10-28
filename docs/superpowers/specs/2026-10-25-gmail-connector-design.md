# Gmail connector design

**Date:** 2026-10-25  
**Status:** Draft for review  
**Decision:** Approach A — mirror Outlook connector layout; History API sync; full Outlook feature parity.

## Goal

Add a first-class Gmail provider so users can connect Google accounts with the same product surface as Outlook: OAuth connect, inbox sync → classify/commitments, thread summary, attachments, and send reply.

## Non-goals

- Gmail labels / archive / trash UI
- Push (Pub/Sub) watch notifications
- Shared / Workspace admin impersonation
- `googleapis` SDK dependency
- Schema migration (reuse `accounts` + `sync_state.cursor`)

## Locked decisions

| Topic | Choice |
|-------|--------|
| Parity | Full Outlook parity (sync, conversation, attachments, send) |
| OAuth | Existing Google Cloud Web client; env-driven |
| Layout | `src/lib/connectors/gmail/{auth,gmail,map,index}.ts` |
| HTTP | Raw `fetch` (match Outlook) |
| Sync | History API + one-time recent inbox backfill on empty cursor |
| Scopes | `openid email profile` + `gmail.readonly` + `gmail.send` |
| Callback | Shared `/api/auth/callback`; `state=gmail:<nonce>` |

## Architecture

```
connections/add → beginConnect({ provider: 'gmail' })
  → gmailConnector.getAuthUrl(state)
  → Google consent
  → /api/auth/callback (provider from state)
  → handleAuthCallback → upsert accounts
  → /connections/success → runSync

sync.ts → getConnector(account.provider).fetchNewMessages
mailbox reply / summarize / attachments → same optional methods as Outlook
```

No changes to `EmailProviderConnector` shape. Register `gmail` in `registry.ts` so `listProviderCatalog` and `getConnector` pick it up.

## Files

| Path | Role |
|------|------|
| `src/lib/connectors/gmail/auth.ts` | Config, auth URL, code exchange, refresh, profile |
| `src/lib/connectors/gmail/gmail.ts` | History/list sync, threads, attachments, send |
| `src/lib/connectors/gmail/map.ts` | Gmail message → `NormalizedMessage`; body decode; reuse/strip HTML |
| `src/lib/connectors/gmail/index.ts` | `gmailConnector` implementing `EmailProviderConnector` |
| `src/lib/connectors/registry.ts` | Add `gmail: gmailConnector` |
| `src/routes/connections/add.tsx` | Enable Connect Gmail |
| `src/routes/connections/index.tsx` | Label + remove “reserved” placeholder |
| `src/routes/connections/success.tsx` | Generic “Account connected” (or provider-agnostic copy) |
| `.env.example` + `README.md` | Google env vars + Cloud Console steps |

## Auth

### Env

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` — default `http://localhost:3000/api/auth/callback` (same as Microsoft)

### Authorize

`https://accounts.google.com/o/oauth2/v2/auth`

- `response_type=code`
- `access_type=offline`
- `prompt=consent` (ensure refresh token on first connect)
- `include_granted_scopes=true`
- `state=gmail:${state}`
- scopes space-separated as listed above

### Token

`POST https://oauth2.googleapis.com/token` for authorization_code and refresh_token grants. Encrypt with existing `encryptSecret` / `decryptSecret`. Require refresh token on code exchange (fail clearly if missing).

### Profile

Resolve email via `https://openidconnect.googleapis.com/v1/userinfo` (or `people`/userinfo equivalent). Prefer `email` claim; store `name` as displayName when present.

### `ensureAccessToken`

Same 60s skew + refresh + DB update pattern as Outlook.

## Sync

### Cursor

`sync_state.cursor` stores Gmail `historyId` as a string.

### Empty cursor (first sync / reconnect)

1. `GET users/me/profile` → current `historyId`
2. Backfill: `users.messages.list` with `labelIds=INBOX`, `maxResults` capped (e.g. 50), optional `q=newer_than:14d` if needed for noise control
3. For each id, `users.messages.get?format=full` → map → `NormalizedMessage[]`
4. Return `{ messages, nextCursor: String(historyId) }`

### Incremental

1. `users.history.list` with `startHistoryId=cursor`, `historyTypes=messageAdded`, filter to inbox when possible
2. Collect unique message ids from history records
3. Fetch full messages; skip missing/deleted
4. If history returns `404` (historyId too old), fall back to empty-cursor backfill path and reset cursor
5. `nextCursor` = latest `historyId` from response (or profile if unchanged)

Dedupe remains in `sync.ts` via existing `providerMessageId` uniqueness.

### Mapping (`map.ts`)

- `providerMessageId` ← message `id`
- `threadId` ← `threadId`
- Parse headers: Subject, From, To, Date, Message-ID
- Decode `text/plain` / `text/html` parts (base64url); strip HTML; truncate body to 4000 chars; snippet ≤ 280
- `webLink` ← `https://mail.google.com/mail/u/0/#inbox/<threadId>`
- `folder` ← `INBOX` when applicable

Share `stripHtml` with Outlook via a tiny shared util **or** duplicate the small helper in `gmail/map.ts` (prefer extract to `connectors/html.ts` only if both import it without churn).

## Conversation

`users.threads.get` with thread id → map messages to `ConversationMessage[]` (newest-first or match Outlook order; cap ~30). Body truncation same as sync.

## Attachments

- **List:** Walk `payload.parts` (recursive) for parts with `filename` + `body.attachmentId`; map size / mimeType; treat `Content-ID` / disposition inline as `isInline`
- **Download:** `users.messages.attachments.get` → base64url decode → `Uint8Array`

## Send reply

1. `users.messages.get` original for `threadId` + `Message-ID` / `References` headers
2. Build RFC 822 MIME (`text/plain`, UTF-8): From account email, To original From, Subject `Re: …`, `In-Reply-To`, `References`, body
3. Base64url-encode raw MIME
4. `users.messages.send` with `{ raw, threadId }`

No draft staging required (unlike Graph createReply). Failure surfaces as thrown Error like Outlook.

## UI

- **Add:** Gmail card active; `beginConnect({ provider: 'gmail' })`; shared pending/error handling (disable both buttons while either redirect is pending, or track per-provider pending)
- **Index:** Map `gmail` → “Gmail”; remove static “reserved / Soon” card when connector is registered (catalog-driven if already; otherwise hardcode parity with Outlook)
- **Success:** Provider-agnostic “Connected — syncing…” copy

## Google Cloud setup (README)

1. Google Cloud Console → enable **Gmail API**
2. OAuth consent screen (External / Testing): add scopes above; add test users
3. Credentials → OAuth 2.0 Client ID → Web application
4. Authorized redirect URI: `http://localhost:3000/api/auth/callback`
5. Put client id/secret in `.env.local`

## Testing (manual)

1. Connect Gmail → lands on success → first sync imports recent inbox
2. Important mail appears on Needs attention; commitments extract when applicable
3. Open panel → summarize thread; list/download attachment
4. Send reply → message appears in Gmail thread; suggested-clear commitments if open loops exist
5. Second sync with no new mail returns empty batch; new inbound mail appears via history
6. Expire/refresh token path: restart after access token expiry still syncs

## Risks / mitigations

| Risk | Mitigation |
|------|------------|
| No refresh token | `prompt=consent` + `access_type=offline`; hard fail if missing |
| Stale historyId | Catch 404 → backfill reset |
| MIME / encoding bugs on send | Keep plain text only; test UTF-8 subject/body |
| Restricted scopes in Testing | Document test-user allowlist |
| Same email already on Outlook | Existing upsert-by-email may overwrite provider — accept for personal app; document reconnect behavior |

## Success criteria

- Gmail appears as a live connector alongside Outlook
- Sync, reply, thread, and attachments work end-to-end on a personal Gmail account
- No new npm dependencies
- `tsc --noEmit` clean
