# Mailbox

Personal attention tracker for email. Sign in, connect Outlook or Gmail, sync mail, classify with OpenAI, and track only messages that need you.

UI matches the Cursor Design prototype in [`mailbox.design.json`](./mailbox.design.json).

## Stack

- TanStack Start + Router + Query
- Better Auth (email/password + Google + Microsoft login)
- Drizzle + SQLite (`./data/mailbox.sqlite`)
- Tailwind CSS v4 + Radix primitives
- Provider connectors (Outlook + Gmail) — **separate** from app login OAuth
- OpenAI Chat Completions

## Setup

### 1. Env

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Notes |
|----------|--------|
| `BETTER_AUTH_SECRET` | Long random string (falls back to `TOKEN_SECRET`) |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `BETTER_AUTH_GOOGLE_*` / `BETTER_AUTH_MICROSOFT_*` | Optional login-only OAuth clients (openid/email/profile). Falls back to mail `GOOGLE_*` / `MICROSOFT_*` if unset |
| `MICROSOFT_CLIENT_ID` / `SECRET` | Entra app for **mail** connect |
| `MICROSOFT_TENANT_ID` | `common` for personal + work |
| `MICROSOFT_REDIRECT_URI` | `http://localhost:3000/api/oauth/mail/callback` |
| `GOOGLE_CLIENT_ID` / `SECRET` | Google Cloud OAuth for **Gmail** |
| `GOOGLE_REDIRECT_URI` | Same mail callback URL |
| `OPENAI_API_KEY` | OpenAI API key |
| `TOKEN_SECRET` | Encrypts stored mail tokens |

Prefer **separate** OAuth clients for login vs mail so consent screens don’t mix identity scopes with Mail.Read/Send.

### 2. Database

```bash
node scripts/migrate-auth-schema.mjs
npm run db:push
```

The migration creates Better Auth tables, renames `accounts` → `mail_accounts`, and attaches existing rows to a seed owner user if needed.

### 3. Azure app registration (Outlook mail)

1. [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations → New
2. Account types: **personal + work/school**
3. Web redirect URI: `http://localhost:3000/api/oauth/mail/callback`
4. Certificates & secrets → new client secret
5. API permissions (delegated): `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access` (+ `openid`/`profile`/`email` via OpenID)
6. For **work** accounts, your tenant admin may need to **grant admin consent**
7. After adding `Mail.Send`, **disconnect and reconnect** existing Outlook accounts so tokens pick up the new scope

For **app login** with Microsoft, use a second app (or the same client only for local testing) with redirect `http://localhost:3000/api/auth/callback/microsoft` and identity scopes only.

### 4. Google Cloud OAuth (Gmail mail)

1. [Google Cloud Console](https://console.cloud.google.com/) → enable **Gmail API**
2. OAuth consent screen (External / Testing):
   - Add yourself as a **test user**
   - Under **Data Access / Scopes**, add:
     - `openid`, `email`, `profile`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
3. Credentials → OAuth 2.0 Client ID → **Web application**
4. Authorized redirect URI: `http://localhost:3000/api/oauth/mail/callback`
5. Put client id/secret in `.env.local` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
6. After changing scopes: **Disconnect** in Mailbox, revoke “Mailbox” under [Google Account → Third-party access](https://myaccount.google.com/permissions), then connect again.

For **app login** with Google, add redirect `http://localhost:3000/api/auth/callback/google` (prefer a separate client with openid/email/profile only).

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Sign up** → onboarding → **Connections** → add Outlook or Gmail.

## Routes

| Path | Purpose |
|------|---------|
| `/login` `/signup` | App authentication |
| `/onboarding` | Profile + timezone |
| `/` | Needs attention |
| `/commitments` | Open loops / due items |
| `/done` | Handled items |
| `/connections` | Linked mailboxes |
| `/connections/add` | Pick provider → mail OAuth |
| `/connections/success` | Post-connect + first sync |
| `/settings` | Model + poll interval |
| `/api/auth/*` | Better Auth handler |
| `/api/oauth/mail/callback` | Mail connector OAuth return |
| `/api/attachments/download` | Session-scoped attachment proxy |

## Notes

- App login social ≠ mail grant. Connecting Gmail/Outlook still requires the mail OAuth flow after sign-in.
- All mail data is scoped by `userId`.
- First sync classifies each new inbox message with OpenAI (`gpt-5.6-luna` by default).
- Only `important` messages become tracker items.
- Sync runs from **Sync now** and about every 2 minutes while Needs attention is open.
