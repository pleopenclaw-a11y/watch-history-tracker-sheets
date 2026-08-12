# ดูแล้ว ดูอยู่ ดูต่อ — Watch History Tracker Sheets

A production-capable Vercel Functions backend is included. With no environment variables, the UI remains a localStorage demo; when configured it loads and mutates the user's Google Sheet.

## Google Sheets setup
1. Create a Google Cloud OAuth web client, enable Sheets and Drive APIs, and add `/api/auth/callback` to its redirect URIs.
2. Copy `.env.example` to `.env.local`, set credentials and a long random `SESSION_SECRET`.
3. Visit `/api/auth/login` to authenticate. The backend requests `drive.file`, creates `watchlog library` when `GOOGLE_SHEET_ID` is absent, and stores an encrypted httpOnly session cookie.

Routes: `GET /api/auth/login`, `GET /api/auth/callback`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET/POST/DELETE /api/entries`.

Quality checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
