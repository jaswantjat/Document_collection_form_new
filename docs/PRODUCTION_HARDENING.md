# Production Hardening

## Runtime Contract
- Node runtime: `20.x`
- Railway builder: Nixpacks using deterministic `npm ci`
- Required in production:
  - `OPENROUTER_API_KEY`
  - `DASHBOARD_PASSWORD`
- Optional but production-relevant:
  - `STIRLING_PDF_API_KEY`
  - `ELTEX_FORM_NOTIFICATIONS_WEBHOOK_URL`
  - `ELTEX_PUBLIC_FORM_BASE_URL`
  - `ELTEX_DOCFLOW_WEBHOOK_URL`
  - `ELTEX_DOCFLOW_WEBHOOK_SECRET`

## Persistence and Readiness
- Project data remains flat-file JSON for this cycle.
- `backend/lib/databasePersistence.js` writes `db.json` atomically via temp-file rename.
- A last-known-good backup is stored as `db.last-known-good.json`.
- `/health` and `/api/health` return readiness plus persistence status.

## Merge Gate
- No open `P0` / `P1` backlog items.
- `npm run lint:app`
- `npm run test:app`
- `npm run test:backend`
- `npm run build:app`
- `npm run test:e2e:critical`
- Docs updated when runtime or deploy behavior changes.

## Post-Deploy Smoke
- Manual CLI:
  - `SMOKE_BASE_URL=https://documentos.eltex.es`
  - `SMOKE_API_BASE_URL=https://documentos.eltex.es`
  - `SMOKE_DASHBOARD_PASSWORD=...`
  - optional `SMOKE_PROJECT_CODE=ELT...`
  - optional `SMOKE_NOTIFICATION_CHANNEL=formNotifications`
  - run `npm run smoke:production`
- GitHub Actions:
  - use workflow `Post Deploy Smoke`
  - provide base URL / API URL / optional project code
  - store dashboard password in repo secret `DASHBOARD_PASSWORD`
