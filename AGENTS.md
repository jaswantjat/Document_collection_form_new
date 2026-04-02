# AGENTS.md
> This file is the AI agent's persistent memory. Read fully every session. Update before ending.
> Last updated: 2026-04-02

---

## Project Overview

Eltex Document Collection Form — a mobile-first web app for Eltex (solar/aerothermal installers in Spain) that walks customers through uploading identity documents, utility bills, and IBI certificates, signing regional legal documents, and completing an energy certificate survey. An admin dashboard lets assessors review submissions and download all files as a ZIP.

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | ^19.2.0 | Frontend UI |
| TypeScript | ~5.9.3 | Type safety throughout |
| Vite | ^7.2.4 | Frontend build + dev server (port 5000) |
| Tailwind CSS | ^3.4.19 | Styling |
| Radix UI / shadcn | various | Accessible UI primitives |
| Lucide React | ^0.562.0 | Icons |
| Vitest | ^4.1.2 | Unit tests |
| Playwright | (root package.json) | E2E tests |
| Node.js / Express | ^4.18.2 | Backend API (port 3001) |
| helmet | ^8.1.0 | Security headers |
| express-rate-limit | ^8.3.2 | Rate limiting on AI/PDF endpoints |
| multer | ^1.4.5-lts.1 | File uploads |
| pdf-lib | ^1.17.1 | PDF manipulation |
| adm-zip | ^0.5.16 | ZIP generation for admin downloads |
| uuid | ^9.0.0 | Access token generation |
| dotenv | ^17.3.1 | Env loading |
| Python / Flask | — | Autocropper microservice (OpenCV, not run in dev) |

---

## Project Structure

```
app/                        → Frontend: React + Vite + TypeScript
  src/
    sections/               → One component per form step (PhoneSection, PropertyDocsSection, etc.)
    pages/                  → Dashboard.tsx (admin), Index.tsx
    components/             → Shared UI (SignaturePad, DocCard, BlurWarningCard, etc.)
    hooks/                  → useFormState, useProject, useLocalStorageBackup, useDebounce, etc.
    lib/                    → Business logic (signedDocumentOverlays, energyCertificateDocument, etc.)
    services/               → api.ts (all fetch calls)
    types/                  → TypeScript types
    config/                 → documentSpec.ts (document config per project type)
    assets/                 → Images (energy cert summary, thermal icons)
  public/                   → Static assets served at root (document templates, logo)
backend/
  server.js                 → All Express routes (~2250 lines)
  db.json                   → Flat-file database (projects, submissions)
  uploads/                  → Uploaded files stored here
autocropper/
  app.py                    → Python/Flask: document detection, perspective correction, PDF gen
docs/
  TASKS.md                  → Bug fix + feature log
  TEST-TRACKER.md           → Full QA cycle history and test status
  PRODUCTION-READINESS.md   → Production security/reliability audit and fixes
  PERFORMANCE_RELIABILITY_TRACKER.md → Performance improvements log
  prds/                     → PRD documents for major features
tests/
  e2e/                      → Playwright E2E specs
  fixtures/                 → Test helpers
scripts/                    → Utility scripts
replit.md                   → Agent instructions (permanent)
AGENTS.md                   → This file (living memory)
```

---

## How To Run

- **Frontend dev server**: workflow "Start application" → `cd app && npm run dev` → port 5000
- **Backend API**: workflow "Backend" → `cd backend && node server.js` → port 3001
- **Unit tests**: `cd app && pnpm run test`
- **E2E tests**: `npx playwright test --reporter=list` (from root)
- **TypeScript check**: `cd app && npx tsc --noEmit`
- **Build for production**: `cd app && npm run build` → output in `app/dist/`, served by backend in prod mode

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `OPENROUTER_API_KEY` | Replit Secrets | AI document extraction (required in prod) |
| `DASHBOARD_PASSWORD` | Replit Secrets | Admin dashboard login (required in prod) |
| `ALLOWED_ORIGINS` | Replit Secrets | Comma-separated CORS whitelist (optional; `*` in dev) |
| `PORT` | optional | Backend port (default 3001) |
| `DATA_DIR` | optional | Where db.json + uploads live (default: `backend/`) |
| `OPENROUTER_MODEL` | optional | AI model (default: `google/gemini-2.0-flash`) |
| `NODE_ENV` | set by Railway | `production` enables strict mode |
| `SEED_SAMPLE_DATA` | optional | Set to `false` to skip seeding test projects |

---

## Test Projects (dev only)

| Code | Token | Type |
|------|-------|------|
| ELT20250001 | b43df737-e202-40d8-ba45-277dceb9d323 | Solar, Cataluña (signing flow) |
| ELT20250002 | 1be9964d-a51d-4532-8f7e-647bb7aeb5f3 | Aerothermal |
| ELT20250003 | 18b8f66e-975e-4ddf-a486-04ad4907b8ad | Solar |
| ELT20250004 | ec-test-token-4444 | Solar + Energy Certificate |

Dashboard password (dev): `eltex2025`

---

## Conventions

### API Response Format
```json
{ "success": true, "project": { ... } }
{ "success": false, "error": "ERROR_CODE", "message": "Human readable" }
```

### Auth Headers
- Customer routes → `x-project-token: <project.accessToken>`
- Admin/dashboard routes → `x-dashboard-token: <session token from /api/dashboard/login>`

### API Paths
- **Singular**: `/api/project/:code` — NOT `/api/projects/:code`
- Project save: `POST /api/project/:code/save`
- Submit: `POST /api/project/:code/submit`
- Download ZIP: `GET /api/project/:code/download-zip`

### Error Handling (backend)
Every route is wrapped in `try/catch`. Errors call `next(err)` or return:
```js
res.status(4xx).json({ success: false, error: 'ERROR_CODE', message: '...' })
```
Global error handler at bottom of `server.js` catches anything that slips through.

### File Naming
- React components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Lib/utils: `camelCase.ts`
- E2E specs: `kebab-case.spec.ts`

### Form State
`useFormState.ts` owns all form data. Changes auto-save to server at 2s debounce.
`useLocalStorageBackup.ts` persists full state (with photos) at 300ms — covers the debounce gap.
On load: if localStorage is >500ms newer than server, localStorage wins.

### Document Rendering
- **Preview** (carousel): `renderSignedDocumentPreview()` — scale=0.25, ~10ms
- **Final artifact** (stored in formData): `renderSignedDocumentOverlay()` — scale=1.0, ~300ms
- **Energy certificate**: `renderEnergyCertificateOverlay()` — 150 DPI canvas output
- Templates are preloaded via `preloadDocumentTemplates()` on section mount

### Province-Specific Flows
- `cataluna` → 3 documents (IVA cat, Generalitat, Representació)
- `madrid` / `valencia` → 2 documents (IVA ES, Poder de representación)
- Other → no signing section

---

## Task Queue

### ✅ Completed

- **[2026-04-02] Production Security (SEC-01–05)**
  - Added `helmet` middleware (security headers)
  - Restricted CORS to `ALLOWED_ORIGINS` env var
  - Rate limiting on AI extraction and PDF endpoints (skipped in dev)
  - Global error handler middleware
  - Startup env-var validation (exits in prod if required keys missing)
  - Changed AI model default to stable `google/gemini-2.0-flash`
  - Files: `backend/server.js`, `backend/package.json`

- **[2026-04-02] Text Overlay Rendering Performance**
  - `SignedDocumentPreview` was calling full-res render (1.0 scale) for carousel preview — 300–600ms per doc
  - Fixed: now calls `renderSignedDocumentPreview` (0.25 scale) — <10ms
  - Added `useDebounce` hook (400ms) so signature re-renders don't fire mid-stroke
  - Added `preloadDocumentTemplates` on mount for instant first render
  - Files: `app/src/sections/RepresentationSection.tsx`, `app/src/hooks/useDebounce.ts` (new)

- **[2026-04-02] API + Mobile E2E Test Coverage**
  - API-01: POST /save valid token → 200
  - API-02: POST /save invalid token → 401
  - API-03: GET /download-zip → ZIP (requires dashboard login first)
  - E2E-MOBILE-01: 375×667 viewport — no horizontal overflow
  - Files: `tests/e2e/api-coverage.spec.ts`, `tests/e2e/mobile.spec.ts`

- **[2026-04-02] Conditional Field Visibility (BUG-COND-01–03)**
  - `shutterWindowCount`, `airConditioningDetails/Type`, `solarPanelDetails` were always rendered
  - Fixed: gated behind their respective `hasX === true` conditions
  - File: `app/src/sections/EnergyCertificateSection.tsx`

- **[2026-04-02] Submit Stuck on "Enviando tu documentación..."**
  - `submitting` state initialized to `true` when `autoSubmit=true` — submission never ran
  - Fixed: replaced state guard with `useRef` (`submitInProgress`)
  - File: `app/src/sections/ReviewSection.tsx`

- **[2026-04-02] Slow Submission / Loading**
  - Energy cert canvas was 300 DPI (2480×3508). Reduced to 150 DPI via `SCALE=0.5`
  - JPEG quality 0.92 → 0.82
  - `saveDB()` converted to async write-queue (was blocking event loop)
  - 60s AbortSignal timeout on submitForm fetch
  - Files: `app/src/lib/energyCertificateDocument.ts`, `app/src/services/api.ts`, `backend/server.js`

- **[2026-04-02] Data Loss on Refresh**
  - `useLocalStorageBackup` — 300ms full-state backup including photos
  - `useBeforeUnloadSave` — keepalive fetch on page unload
  - On load: merge localStorage if newer than server
  - Files: `app/src/hooks/useLocalStorageBackup.ts`, `app/src/hooks/useBeforeUnloadSave.ts`, `app/src/App.tsx`

- **[2026-04-02] International Phone Numbers Rejected**
  - `parseSpanishPhone()` only accepted 9-digit Spanish mobiles
  - Fixed: `parsePhone()` accepts E.164 and `00CC…` formats; backend `normalizePhone()` updated
  - Files: `app/src/lib/phone.ts`, `backend/server.js`

- **[2026-04-02] Driving Licence Rejection**
  - Document-type-gated validation rejected passports/licences
  - Fixed: identity-number-first validation; `isValidIdentityNumber()` safety net
  - Files: `app/src/lib/documentValidation.ts`, AI prompt updates

### 🔧 In Progress
- None

### 📋 To Do
- E2E-FLOW-03: EC resume path (in-progress EC → re-open → continues)
- E2E-FLOW-04: EC follow-up path (property-docs → EC → review)
- DASH-01: Dashboard shows completed EC preview + "Ver PDF"
- DASH-02: Dashboard shows "Saltado por cliente" badge for skipped EC

---

## Session Log

### 2026-04-02 — Session: Production Readiness
- Security fixes: helmet, CORS, rate limiting, global error handler, startup validation
- Performance fix: text overlay preview was using full-res (1.0) — switched to 0.25 scale + debounce
- New tests: API-01, API-02, API-03, E2E-MOBILE-01
- Updated docs: `docs/PRODUCTION-READINESS.md`, `docs/TEST-TRACKER.md`
- Grand total: **56/56 tests passing** (33 E2E + 23 unit)
- Next: E2E-FLOW-03 (resume path), dashboard badge tests

---

## Known Issues

- [ ] `db.json` flat-file is not atomic — a crash mid-write could corrupt it. Acceptable for now; would need a real DB for high traffic.
- [ ] Dashboard sessions are in-memory — all sessions invalidated on server restart.
- [ ] No pagination on dashboard (slow if 1000+ projects).
- [ ] Autocropper Python service not integrated into dev workflow — must run manually.

---

## Mistakes Made (DON'T REPEAT THESE)

### ❌ Used `/api/projects/` (plural) in tests
- **When**: E2E Cycle 1
- **What happened**: 404 — backend uses singular `/api/project/:code`
- **Fix**: Corrected all test paths to `/api/project/`
- **Rule**: API path is always singular `/api/project/:code`, never plural

### ❌ Used `x-token` header instead of `x-project-token`
- **When**: E2E Cycle 1
- **What happened**: 401 on all customer API calls in tests
- **Fix**: Correct header is `x-project-token`
- **Rule**: Customer auth = `x-project-token`. Admin auth = `x-dashboard-token`.

### ❌ Assumed download-zip needed only the password as token
- **When**: Writing API-03 test
- **What happened**: 401 — `/download-zip` requires a session token, not the raw password
- **Fix**: Must POST to `/api/dashboard/login` first, then use the returned `token`
- **Rule**: Dashboard auth is session-based. Always login first, use returned token.

### ❌ Called `renderSignedDocumentOverlay` (full-res) for live preview
- **When**: Original implementation of `SignedDocumentPreview`
- **What happened**: 300–600ms render on every signature stroke — UI froze
- **Fix**: Use `renderSignedDocumentPreview` (0.25 scale) for previews; full-res only on final commit
- **Rule**: Preview = `renderSignedDocumentPreview`. Final artifact = `renderSignedDocumentOverlay`.

### ❌ Added import before creating the file
- **When**: Adding `useDebounce` import to `RepresentationSection.tsx`
- **What happened**: Vite HMR error — module not found
- **Fix**: Create the file first, then add the import
- **Rule**: Create the module before importing it.
