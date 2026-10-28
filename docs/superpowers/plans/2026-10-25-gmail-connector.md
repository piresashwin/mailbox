# Gmail Connector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full Outlook-parity Gmail connector (OAuth, history sync, thread, attachments, send).

**Architecture:** Mirror `src/lib/connectors/outlook/` with raw `fetch`; register in `registry.ts`; enable connections UI.

**Tech stack:** Existing TanStack Start, Drizzle accounts/sync_state, `encryptSecret`, Gmail API + Google OAuth.

**Spec:** `docs/superpowers/specs/2026-10-25-gmail-connector-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `gmail/auth.ts` | OAuth URL, tokens, profile |
| `gmail/map.ts` | Message/body mapping |
| `gmail/gmail.ts` | Sync, thread, attachments, send |
| `gmail/index.ts` | Connector export |
| `registry.ts` | Register gmail |
| connections UI + `.env.example` + README | Wire + docs |

## Tasks

1. Implement `auth.ts` + `map.ts`
2. Implement `gmail.ts` (sync/history/backfill, conversation, attachments, send)
3. Wire `index.ts` + registry
4. Enable UI + env/docs
5. `tsc --noEmit`

No separate unit-test suite exists for Outlook; verify with typecheck + manual connect when Google env is set.
