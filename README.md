# ดูแล้ว ดูอยู่ ดูต่อ — Watch History Tracker Sheets

A polished frontend MVP for tracking movies, series, and anime in a streaming-inspired dark UI. It includes local demo persistence, CRUD-like add/edit/delete interactions, search, status filters, ratings, responsive grid/list/columns views, and poster URLs.

## Run

```bash
npm install
npm run dev
```

Quality checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Google Sheets roadmap

The UI currently uses localStorage so it is immediately deployable as a frontend demo. Google OAuth and per-user Google Sheets synchronization should be added behind server-side Vercel Functions next. Keep OAuth secrets/tokens server-side, use `drive.file`, validate the immutable A:K sheet schema, and never treat localStorage as the source of truth. See `PLAN.md` for the full security and API design.
