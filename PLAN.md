# Watch History Tracker Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone web app similar to `watch-history-tracker` where each signed-in user stores a simple watch-history collection in a spreadsheet owned by that user’s Google Drive.

**Architecture:** Use a small browser UI and server-side Vercel Functions. Google OAuth is handled by the server; Google access tokens remain server-side, and every Sheets request is authorized against the signed-in user’s own Drive file. On first use, the app creates or discovers one app-owned spreadsheet in that user’s Drive, then reads and writes a single `Watch History` tab through the Google Sheets API.

**Tech Stack:** TypeScript, a minimal Vercel-compatible web app (React or the smallest framework already selected during scaffolding), Vercel Functions, Google OAuth 2.0, Google Sheets API, Google Drive API, Vitest, Playwright, and browser `localStorage` only for non-authoritative UI/cache state.

## Global Constraints

- Create a new sibling project only at `/home/jornjud/projects/watch-history-tracker-sheets`.
- Do not modify `/home/jornjud/projects/watch-history-tracker`.
- Do not use a shared spreadsheet, shared service-account sheet, or service-account credentials.
- Each user may access only the spreadsheet created for or explicitly selected by that user in their own Google Drive.
- Store only: title, poster/image URL, content type (`movie`, `series`, `anime`), season and episode progress, platform, rating `0–10`, short comment, created timestamp, and updated timestamp.
- Keep Google OAuth access/refresh tokens and client secrets on the server; never expose them to browser JavaScript or logs.
- Treat Google Sheets as the source of truth; cached data is disposable and must never silently overwrite newer remote data.
- Use UTC ISO-8601 timestamps in the application and sheet values.
- Do not add unrelated features such as title metadata lookup, social sharing, public profiles, recommendations, or a service-account data layer.
- Do not commit or push as part of implementation.

## Product and storage decision

Google Sheets is a reasonable fit for this intentionally small, user-owned tracker: users can inspect/export their data, ownership is visible in Drive, and the API supports reading, updating, batch updates, and appending values. The tradeoffs are API quotas, network latency, spreadsheet edits outside the app, weak transactional/concurrency semantics, and increasingly awkward filtering as a user’s sheet grows. Keep the MVP bounded to one user’s modest collection and serialize writes per request; revisit Firestore if the product needs shared data, complex queries, subscriptions, reliable transactions, or large collections.

`localStorage` is useful only for draft form state, last-selected filters, and a short-lived read cache. It is not an acceptable primary store because it is device/browser-local, can be cleared, is not naturally shared across devices, and provides no account-level isolation. Firestore would be the better production database for an app-owned multi-user product, but it adds Firebase auth, rules, billing/indexing, and an app-owned data custody model that this product explicitly avoids.

## Security and privacy model

- Sign-in identifies the user to the app; the Google account remains the authority over the spreadsheet.
- Use Authorization Code OAuth on the server with `state` validation, `httpOnly`, `secure`, `sameSite=lax` session cookies, short session lifetime, CSRF protection on mutations, and encrypted server-side token storage. Do not place tokens in query strings, localStorage, or client-visible JSON.
- Request the minimum practical scope: start with `openid email profile` plus `https://www.googleapis.com/auth/drive.file` and document why it is needed. If the API requires broader spreadsheet access for the chosen creation/discovery path, use the narrowest documented alternative and record that decision before implementation. Do not request full Drive access unless an approved design proves it necessary.
- The server must derive the Google user identity from the validated session, not from a client-supplied user ID. Never accept a client-supplied spreadsheet ID without checking ownership/allow-list membership for that session.
- Prefer creating the spreadsheet with the user’s OAuth grant. Persist only the spreadsheet ID and schema version in the server session/database if needed; do not persist sheet rows in an app-owned database.
- Return generic errors to clients and log request IDs plus safe error categories, never OAuth tokens, authorization codes, sheet contents, comments, or poster URLs.
- Explain in the UI that data is stored in the user’s Google Drive, the app can read/write only the app-created file, revoking Google access prevents synchronization, and deleting the file prevents future sync until the app creates a replacement.
- Avoid making the spreadsheet public or changing sharing permissions. Validate poster URLs as `http`/`https` and render them with safe image handling; comments are text, not HTML.

## OAuth and Google Cloud setup

1. Create a dedicated Google Cloud project for this sibling app; enable Google Sheets API and Google Drive API.
2. Configure the OAuth consent screen, publishing/test users, app name, support/contact information, and privacy-policy URL appropriate to the deployment. Decide whether verification is required for the selected scopes before production launch.
3. Create a Web application OAuth client with exact local and production redirect URIs, for example `/api/auth/callback` on each origin. Do not use wildcard redirect URIs.
4. Configure server-only variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SESSION_SECRET`, and any token-encryption key. Use `.env.example` with names only; `.env.local` must be ignored.
5. Implement `/api/auth/login`, `/api/auth/callback`, `/api/auth/me`, and `/api/auth/logout`. Callback behavior: verify `state`, exchange the code, fetch identity, establish the session, and redirect to the app. Handle denial and callback errors without exposing provider details.
6. Verify the exact OAuth consent/scopes in a test Google account and test revocation, expired access tokens, and a user who has multiple Drive spreadsheets with similar names.

## Sheet schema

Create one spreadsheet named `Watch History Tracker` with one tab named `Watch History`. The first row is an immutable header row:

| Column | Field | Format and validation |
|---|---|---|
| A | `id` | UUID; immutable app row key |
| B | `title` | Required short text |
| C | `posterUrl` | Optional `http`/`https` URL |
| D | `contentType` | Exactly `movie`, `series`, or `anime` |
| E | `season` | Blank for movie; non-negative integer otherwise |
| F | `episode` | Blank for movie; non-negative integer otherwise |
| G | `platform` | Optional short text |
| H | `rating` | Blank or decimal from `0` through `10` |
| I | `comment` | Optional short text; enforce a UI limit (for example 500 characters) |
| J | `createdAt` | UTC ISO-8601; immutable after creation |
| K | `updatedAt` | UTC ISO-8601; changed on every successful update |

On initialization, create the spreadsheet, add/rename the tab, write the headers, and optionally freeze row 1. On reads, require the header signature; if it is missing or incompatible, show a repair/stop-sync message rather than guessing columns. Use `id` for updates/deletes: read rows, locate the row by ID, then update the exact A:K range. Use append for creates and batch update for an edit plus timestamp. A row deleted manually in Drive is treated as deleted; never resurrect it from cache without explicit user action.

## Data access flow

```text
Browser -> session endpoint -> server validates session
Browser -> /api/entries -> server refreshes token if needed
       -> server resolves the user’s app spreadsheet and validates headers
       -> Sheets API read/write using that user’s OAuth credentials
       -> server returns normalized rows; browser renders/cache-updates
```

- `GET /api/entries`: resolve sheet, read `A:K`, validate headers, normalize rows, return entries and a revision marker such as `updatedAt` maximum.
- `POST /api/entries`: validate the payload, generate UUID/timestamps server-side, append one row, return the created entry.
- `PATCH /api/entries/:id`: validate allowed fields, re-read/find the row, preserve `id`/`createdAt`, update the exact row with a fresh `updatedAt`.
- `DELETE /api/entries/:id`: locate the row, clear/delete that row using the Sheets API, and return success only after Google confirms it.
- `POST /api/sheet/initialize`: create/repair the app sheet only after authentication and explicit user confirmation when a sheet is missing.
- Never expose raw Google API responses or arbitrary range/spreadsheet operations to the client.

## Offline and error behavior

The app should show cached entries as read-only or clearly stale when offline. New edits may be saved as a local outbox only if the UI labels them `Pending sync`; queued operations require stable IDs, retry limits, and conflict checks. The MVP may instead disable mutation controls while offline, which is safer than pretending a write succeeded. A successful write must be confirmed by the API before removing its pending state.

Map errors to actionable states: sign-in required, consent denied, token expired (refresh/re-auth), insufficient scope, sheet missing, schema mismatch, rate limited (retry with backoff), network unavailable (retry), and Google service unavailable (retry later). Never overwrite the cache after a failed write. On conflict, re-fetch and ask the user to choose; do not last-write-wins silently.

## Files likely to create

The implementation should remain a separate project. Exact names may vary only if the selected framework requires an equivalent route convention:

- `watch-history-tracker-sheets/package.json` — scripts and runtime dependencies.
- `watch-history-tracker-sheets/tsconfig.json` — TypeScript configuration.
- `watch-history-tracker-sheets/.gitignore` — ignore `.env*` except `.env.example`, build output, and local tooling state.
- `watch-history-tracker-sheets/.env.example` — non-secret variable names and redirect URI notes.
- `watch-history-tracker-sheets/README.md` — local setup, Google Cloud setup, consent-screen notes, and deployment runbook.
- `watch-history-tracker-sheets/src/domain/entry.ts` — entry type, allowed values, validation, normalization, and sheet row mapping.
- `watch-history-tracker-sheets/src/server/google-oauth.ts` — OAuth URL, callback exchange, identity, refresh, and scope handling.
- `watch-history-tracker-sheets/src/server/session.ts` — signed/encrypted session cookie lifecycle and CSRF checks.
- `watch-history-tracker-sheets/src/server/sheets-repository.ts` — spreadsheet discovery/creation, schema initialization, row reads, append/update/delete.
- `watch-history-tracker-sheets/src/server/api-error.ts` — safe error categories and HTTP mapping.
- `watch-history-tracker-sheets/src/routes/api/auth/*.ts` — login, callback, session, logout handlers.
- `watch-history-tracker-sheets/src/routes/api/entries.ts` and `src/routes/api/entries/[id].ts` — authenticated CRUD handlers.
- `watch-history-tracker-sheets/src/routes/api/sheet/initialize.ts` — explicit sheet initialization handler.
- `watch-history-tracker-sheets/src/client/api.ts` — typed fetch client and error mapping.
- `watch-history-tracker-sheets/src/client/store.ts` — remote state, stale cache, and optional pending outbox.
- `watch-history-tracker-sheets/src/components/EntryForm.*`, `EntryList.*`, `AuthStatus.*`, `ErrorBanner.*` — focused UI pieces.
- `watch-history-tracker-sheets/src/app.*` and `src/styles.*` — app shell and restrained styling matching the simple tracker intent.
- `watch-history-tracker-sheets/tests/unit/entry.test.ts`, `sheets-repository.test.ts`, `oauth.test.ts` — pure validation, repository mapping, and OAuth/session tests.
- `watch-history-tracker-sheets/tests/integration/api.test.ts` — authenticated API tests with mocked Google clients.
- `watch-history-tracker-sheets/tests/e2e/watch-history.spec.ts` — browser flow against local mocked OAuth/Sheets endpoints.
- `watch-history-tracker-sheets/vercel.json` — only if required by the selected framework; keep runtime configuration minimal.

## Phased implementation tasks

### Phase 0 — Project boundary and acceptance contract

- [ ] Confirm the new directory is empty and record the existing tracker’s clean status without editing it.
- [ ] Choose the smallest TypeScript/Vercel setup that supports server routes and the existing static-app simplicity.
- [ ] Write the README’s setup prerequisites and the acceptance criteria below before implementation.
- [ ] Add package scripts for `dev`, `build`, `typecheck`, `lint`, `test`, and `test:e2e`; run the empty scaffold checks.

### Phase 1 — Domain model and UI shell

- [ ] Define the `WatchEntry` contract and reject missing titles, unknown content types, invalid rating ranges, negative progress, invalid URLs, and overlong comments.
- [ ] Build list, add/edit form, empty state, loading state, auth status, and error banner.
- [ ] Add client tests for validation, normalization, filtering, and stale-state rendering.
- [ ] Keep all UI data access behind `src/client/api.ts`; no component may call Google APIs.

### Phase 2 — OAuth and session security

- [ ] Implement login/callback/session/logout with state and CSRF protections.
- [ ] Add tests for valid callback, invalid state, denial, expired session, refresh failure, and logout cookie clearing.
- [ ] Confirm secrets never appear in responses, browser storage, client bundles, or test snapshots.

### Phase 3 — Per-user spreadsheet repository

- [ ] Implement spreadsheet creation/discovery using the authenticated user’s OAuth credentials only.
- [ ] Initialize and validate the exact header schema and schema version behavior.
- [ ] Implement typed CRUD and row-ID lookup with exact A1 ranges.
- [ ] Add mocked API tests proving user A’s spreadsheet ID cannot be used by user B, malformed headers stop writes, and failed writes preserve cached state.

### Phase 4 — Integration and resilience

- [ ] Connect the UI to authenticated CRUD, including optimistic loading states only where success is confirmed and clear pending/error states.
- [ ] Add retry/backoff for transient errors and explicit handling for offline, quota, revoked consent, deleted sheet, and schema mismatch.
- [ ] Add integration and browser tests for sign-in, first-sheet creation, reload persistence, add/edit/delete, and two-user isolation.

### Phase 5 — Deployment and verification

- [ ] Configure Google Cloud OAuth redirect URIs for local, preview, and production origins.
- [ ] Add Vercel environment variables per environment; keep secrets out of the repository. Vercel Functions are appropriate for the server routes, and environment variables apply to new deployments only.
- [ ] Deploy a preview, run the full automated suite, then manually test with two separate Google accounts and inspect Drive permissions.
- [ ] Verify production callback URL, HTTPS cookies, no public sheet sharing, token redaction, rate-limit behavior, and rollback instructions.

## Testing and verification matrix

- Unit: field validation, rating/progress normalization, timestamps, row/header mapping, safe error mapping.
- Repository integration: append/read/update/delete against a mocked Sheets client; exact row targeting; schema mismatch; duplicate IDs; Google 401 refresh path; 403/404/429/5xx mapping.
- OAuth integration: callback state, consent denial, refresh, revocation, cookie flags, and no token leakage.
- E2E: unauthenticated redirect, first-run initialization, CRUD, refresh/reload, stale/offline UI, retry, and schema-error UI.
- Isolation: run two sessions with two Google identities and assert each sees only its own sheet; attempt a cross-user sheet ID and require 403/404 without a Google call that mutates it.
- Manual Drive check: each account owns or has app-created access to its own file; there is no shared service account and no public link.
- Quality gates: `npm run typecheck`, `npm run lint`, `npm test -- --run`, `npm run build`, and `npm run test:e2e` all pass; inspect the final diff and confirm only the new sibling project changed.

## Risks and mitigations

- OAuth verification or restricted-scope review delays launch: use the narrowest scopes, document use, configure test users, and plan a consent-screen review before production.
- A user manually edits headers or rows: validate schema, preserve IDs, show a repair message, and provide a documented recovery path.
- Sheets is eventually consistent or concurrently edited: use exact row reads, fresh `updatedAt`, conflict checks, and no silent cache overwrite.
- API quotas and latency degrade UX: batch reads where useful, debounce reloads, retry only transient errors, and show explicit status.
- Refresh tokens are mishandled: encrypt server-side, rotate/replace safely, clear on revocation, and test expiration paths.
- Poster URLs fail or contain unsafe content: treat images as optional, validate schemes, use safe rendering, and never proxy arbitrary URLs through the server in the MVP.
- Vercel preview/prod redirect mismatch: configure every exact origin and test each environment before release.
- A browser cache leaks across accounts: namespace cache by a server-provided stable user identity, clear it on logout, and never use cached rows before session identity is known.

## Acceptance criteria

- A new user can sign in with Google, authorize the requested scopes, create their own app spreadsheet, and see an empty state.
- A user can create, read, edit, and delete entries containing exactly the required fields, with server-generated UUID and UTC created/updated timestamps.
- Movie entries do not require season/episode; series/anime progress accepts only non-negative integers.
- Rating is constrained to `0–10`; comments are short and plain text; poster URLs are optional and safely validated.
- Reloading from another browser/device after Google sign-in reads the same user’s sheet data.
- A second Google user gets a separate sheet and cannot read or mutate the first user’s entries, even if a client submits the first spreadsheet ID.
- No service-account spreadsheet, public sharing, client-exposed OAuth secret, access token, or refresh token exists.
- Offline and Google/API failures are visible, actionable, and never reported as successful writes.
- Preview and production deploy successfully on Vercel with environment-specific OAuth redirect URIs and secrets.
- Automated checks and the manual two-account isolation/Drive-permission verification pass.

## Recommendation

Proceed with Google Sheets for this small, private, user-owned MVP, using server-side OAuth and one app-created sheet per Google user. Reconsider Firestore when the product needs high-volume data, reliable concurrent writes, richer queries, or app-controlled multi-user features; keep localStorage as cache/draft support only.

References checked during planning: [Google Sheets value read/write methods](https://developers.google.com/workspace/sheets/api/guides/values), [Sheets append authorization](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append), [Vercel Functions](https://vercel.com/docs/functions), and [Vercel environment variables](https://vercel.com/docs/environment-variables).
