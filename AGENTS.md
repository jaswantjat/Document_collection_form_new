# AGENTS.md
> This file is the AI agent's persistent memory. Read fully every session. Update before ending.
> Last updated: 2026-04-06

## Quick-Reference: What Changed Recently
- **ChunkErrorBoundary now categorises errors**: chunk-load failures (network) vs render errors. Detects via `error.message` keywords ("failed to fetch", "dynamically imported", etc.). Shows different Spanish copy for each case. Still reloads on retry (React.lazy state cannot be reset without reload).
- **lazyWithRetry upgraded to 5 attempts**: initial + 4 retries at 1 s / 2 s / 3 s / 4 s = 10 s total window. Previously 3 attempts at 1 s / 1 s = 2 s — too short for mobile outages.
- **Eager EC chunk preload at RepresentationSection render**: `import('@/sections/EnergyCertificateSection').catch(()=>{})` fires while the user is on the signing screen. By the time they tap "Continuar" (5–30 s later), the 20 KB chunk is guaranteed in the ESM cache. This eliminates the lazy-load network window at the representation→energy-certificate transition.
- **Auth model**: Customer routes need only `code` in URL. No `x-project-token` header sent anywhere. `requireProject` middleware only verifies project exists by code.
- **Dashboard URL**: `/?code=CODE&source=assessor` — no token, no `&token=` param.
- **Follow-up routing**: `getInitialSection` returns `'review'` when `hasExistingRepresentationFlow(fd)` is true (signatures done).
- **Navigation back-button logic** (all in App.tsx):
  - PropertyDocs `onBack`: shown only when `followUpDocumentFlow=true` → goes to `'review'`
  - EnergyCertificate `onBack` in followUp: goes to `'review'` (was `'property-docs'`)
  - Review `onBack` in followUp: hidden (`undefined`) — no stray back into energy-cert
  - `handlePhoneConfirmed`: calls `getInitialSection(...)` — no flash of property-docs for returning users
- **IBI detection**: repeating-char RC check (4+ chars) + all-null blank-template rejection override.
- **Electricity prompt**: rejects gas/water/phone bills; blank template detection; screen-photo guidance.

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
| `OPENROUTER_MODEL` | optional | AI model (default: `google/gemini-3.1-flash-lite-preview`) |
| `NODE_ENV` | set by Railway | `production` enables strict mode |
| `SEED_SAMPLE_DATA` | optional | Set to `false` to skip seeding test projects |
| `ELTEX_DOCFLOW_WEBHOOK_URL` | Railway Variables | DocFlow webhook URL — when set, fires a `doc_update` POST after every successful `/submit` |
| `ELTEX_DOCFLOW_WEBHOOK_SECRET` | optional override | Overrides the built-in default (`eltex-docflow-2026-v1`) sent as `X-Eltex-Webhook-Secret` on every DocFlow POST. Default works without any Railway config. |

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
- Customer routes → **no auth header** — `requireProject` middleware only checks project exists by code. Token auth was fully removed (2026-04-05 T001).
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
  - Changed AI model default to `google/gemini-3.1-flash-lite-preview`
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

- **[2026-04-02] E2E-FLOW-03 + E2E-FLOW-04 Tests**
  - FLOW-03: EC resume path — seeds partially-filled housing data via `/api/test/reset-ec-partial/:code`, verifies cadastralReference field loads from server
  - FLOW-04: Follow-up path routing — verifies property-docs → EC → review sequence using 3 new backend test endpoints
  - New backend test endpoints: `reset-ec-partial`, `reset-property-docs`, `restore-base-flow`, `reset-ec-partial`
  - Added ELT20250005 to `getDefaultProjects()` seed with fixed token `ec-flow-token-5555`
  - Fixed test cross-contamination: changed `beforeEach` to call `restore-base-flow` (restores full state) instead of just `reset-ec`
  - Fixed FLOW-04 race: navigate to `about:blank` before `restore-base-flow` so beforeunload keepalive save doesn't overwrite restored state
  - Files: `backend/server.js`, `tests/e2e/energy-certificate-flow.spec.ts`

- **[2026-04-02] DASH-01 + DASH-02 verification**
  - Both already implemented in existing code:
  - DASH-01 (`EnergyCertificatePanel`): shows preview image + "Ver PDF" when EC is completed
  - DASH-02 (`EnergyCertificatePanel` + table cell badge): shows "Saltado por cliente" label/badge when EC is skipped
  - No code changes needed

- **[2026-04-02] Full searchable country picker (WhatsApp-style)**
  - Created `app/src/lib/countries.ts`: 200+ countries with Spanish names, flag emoji, dial code, placeholder
  - Custom `CountryPickerSheet` component: full-screen overlay, search input (auto-focused), top-countries section + full alphabetical list, Escape / tap-outside to dismiss
  - Country button (flag + code + chevron) replaces native `<select>`
  - Auto-formats Spanish (+34) numbers as XXX XXX XXX while typing
  - Files: `app/src/lib/countries.ts` (new), `app/src/sections/PhoneSection.tsx`

- **[2026-04-02] Phone entry — country-code picker + friction removal**
  - Replaced single free-text phone field with [country dropdown] + [local-number input] pair
  - Dropdown defaults to 🇪🇸 +34; covers ES/GB/PT/FR/DE/IT/NL/US
  - Placeholder in number field updates to match country (e.g. "612 345 678" for Spain)
  - Combined value flows through existing `parsePhone` E.164 normaliser — no backend changes
  - File: `app/src/sections/PhoneSection.tsx`

- **[2026-04-02] DPR-Aware Preview Rendering (blur fix)**
  - Root cause: carousel renders at 310 px and `<img class="w-full">` is shown at full viewport width; on 3× DPR iPhones this causes 3.8× upscaling → extreme blur
  - Fix: `renderSignedDocumentPreview` now reads `window.innerWidth × window.devicePixelRatio` and picks the cheapest source image that satisfies the physical pixel budget:
    - ≤ 310 px → thumbnail WebP (1× DPR, unchanged)
    - 311–620 px → modal WebP at scale 1.0 (2× DPR — pixel-perfect)
    - > 620 px → full-res PNG at fractional scale (3× DPR — pixel-perfect)
  - `preloadDocumentTemplates` now loads modal WebPs as priority 2 (between thumb and full-res)
  - File: `app/src/lib/signedDocumentOverlays.ts`

- **[2026-04-02] Representació Field Alignment Fix**
  - Pixel-level scan of `autoritzacio-representacio.jpg` (1241×1754 px) revealed all persona/empresa box tops were 8–12px above actual template content rows
  - Adjusted REPRESENTACIO_FIELDS y-coordinates to match actual pixel rows (+8 to +12px per field)
  - lloc/data/signature positions confirmed correct, left unchanged
  - Bumped SIGNED_DOCUMENT_TEMPLATE_VERSION to '2026-04-02.1' to force re-render of stored docs
  - File: `app/src/lib/signedDocumentOverlays.ts`

- **[2026-04-02] False "connection issue" warnings on mobile (MOBILE-SAVE-01)**
  - Auto-save showed a toast warning on the VERY FIRST save failure — one mobile network blip triggered it
  - Added 10-second `AbortSignal.timeout` to `saveProgress` API call (was hanging forever)
  - Added `consecutiveSaveFailures` counter: warning only shown after 2+ consecutive failures
  - Warning auto-dismisses on the next successful save
  - Files: `app/src/services/api.ts`, `app/src/hooks/useFormState.ts`

- **[2026-04-03] Phone validation hardening**
  - Spain (+34): `parsePhone('+34512345678')` passed because E.164 path only checks digit count — numbers starting with 1–5 wrongly accepted
  - Fixed: `getPhoneError` now applies Spain-specific rules (9 digits, starts with 6–9) before falling through to E.164 check
  - `buildPhone` `^0` → `^0+` to strip all leading zeros
  - Extracted `parsePhone`, `buildPhone`, `getPhoneError`, `formatLocalNumber` to `app/src/lib/phone.ts` — `PhoneSection.tsx` imports from it; test file imports from it (no more copy-paste)
  - Tests: 7 → 21 (added `buildPhone`, `getPhoneError`, `formatLocalNumber` coverage)

- **[2026-04-03] Deferred-signature routing fix**
  - `hasRepresentationDone()` was treating `signatureDeferred: true` as "section done" — users who clicked "Firmar más tarde" could never see the signature section again on reload
  - Removed the `signatureDeferred` early-return from `hasRepresentationDone()`; the "Firmar más tarde" in-session navigation was never affected (it calls `onContinue()` directly)
  - File: `app/src/App.tsx`

### 🔧 In Progress
- None

### ✅ Completed (continued)

- **[2026-04-06] Sync GitHub commit 3c83fca — "Harden mobile resilience and stabilize QA baseline"**
  - Synced via GitHub API (git fetch blocked in main agent environment)
  - Files updated: `app/eslint.config.js`, `app/src/App.tsx`, `app/src/hooks/useProject.ts`, `app/src/lib/signedDocumentOverlays.ts`, `app/src/sections/PropertyDocsSection.tsx`, `app/src/sections/RepresentationSection.tsx`, `app/src/services/api.ts`, `app/vite.config.ts`, `playwright.config.ts`, `scripts/e2e.sh`
  - Files added: `app/src/lib/signedDocumentOverlays.test.ts`, `tests/e2e/low-network.spec.ts`, `tests/e2e/smoke.spec.ts`
  - TypeScript: 0 errors. Both workflows running cleanly after sync.

### ✅ Completed (continued)

- **[2026-04-05] Dashboard "No se encontraron archivos" bug fix**
  - Root cause: auto-save strips `preview` from formData → db.json has no images; `preUploadAssets` stores files on disk in `project.assetFiles`; but `serializeProject` did not include `assetFiles` so the frontend never saw the disk paths
  - Fix 1: Added `assetFiles` to `serializeProject` output (backend)
  - Fix 2: `buildDashboardSummary` now checks `project.assetFiles` as fallback for `present` flags on DNI/electricity
  - Fix 3: `getDocumentAssetsFromProject` and `getElectricityAssetsFromProject` now fall back to `project.assetFiles` paths when `dataUrl` is null
  - Fix 4: Proxied `/uploads` in Vite dev config so asset file URLs resolve correctly in dev
  - TypeScript: 0 errors
  - Files: `backend/server.js`, `app/src/pages/Dashboard.tsx`, `app/vite.config.ts`

### ✅ Completed (continued)

- **[2026-04-05] Network Performance Optimization (PERF-01, 02, 03)**
  - PERF-01: Added `compression` middleware to Express — gzip compresses all API responses (5–7× payload reduction)
  - PERF-02: Changed `compressImageForAI` defaults to WebP 70% at 1200px (was JPEG 82% at 1600px) — ~40% smaller per image sent to AI
  - PERF-03: Progressive photo upload in `useFormState.ts` — photos now upload to server in background immediately after capture, not only at ReviewSection mount
  - PRD: `docs/prds/PRD-performance-network-optimization.md`
  - QA: 15/15 checks PASS across all three features; TypeScript 0 errors
  - Files: `backend/server.js`, `backend/package.json`, `app/src/lib/photoValidation.ts`, `app/src/hooks/useFormState.ts`

### ✅ Completed (continued)

- **[2026-04-05] Representation card missing in followUpMode (ReviewSection.tsx)**
  - `needsRepresentation` was `!followUpMode && !!locationVar && locationVar !== 'other'`
  - When followUpMode=true the entire representation card was suppressed, even for fully-signed projects
  - Fix: removed `!followUpMode &&` — card now appears whenever location is relevant; `signaturesOk=true` puts it in COMPLETADO
  - File: `app/src/sections/ReviewSection.tsx` (line 72)

### ✅ Completed (continued)

- **[2026-04-03] windowFrameMaterial + windowGlassType label fix**
  - Label functions existed but raw enum values were rendered in the energy cert document (`'aluminio'` instead of `'Aluminio'`, `'simple'` instead of `'Simple'`)
  - Fixed: wired `windowFrameMaterialLabel()` and `windowGlassTypeLabel()` into the rows2b array
  - File: `app/src/lib/energyCertificateDocument.ts`

- **[2026-04-03] Optional "Firmar más tarde" (remote / deferred signature)**
  - Signature section was a hard gate — no way to proceed without a signature
  - Added `signatureDeferred?: boolean` to `RepresentationData` type
  - `hasRepresentationDone()` in App.tsx now returns `true` for deferred users (prevents routing loop)
  - "Firmar más tarde" tertiary button in RepresentationSection: sets flag, calls onContinue()
  - `handleContinue()` clears `signatureDeferred: undefined` when customer actually signs
  - ReviewSection shows context-aware warning ("Firma pendiente..." vs "Sin ellas, tu asesor no podrá...")
  - Files: `app/src/types/index.ts`, `app/src/App.tsx`, `app/src/sections/RepresentationSection.tsx`, `app/src/sections/ReviewSection.tsx`

- **[2026-04-03] Energy certificate submission speed fix**
  - Root cause: `createRenderedEnergyCertificateAsset()` ran on the submit() hot path — 1–3s JPEG encode on 2.17M pixel canvas blocked the UI
  - Fix: pre-render on ReviewSection mount (background useEffect), store Promise in ref; submit() awaits the cached Promise → instant if user spent ≥1s reading review
  - Fallback: if user taps submit before render finishes, awaits the in-flight Promise (no regression)
  - File: `app/src/sections/ReviewSection.tsx`

### ✅ Completed (continued)

- **[2026-04-05] DocFlow webhook race condition + locale field fix**
  - Bug 1: `fireDocFlowNewOrder` was called fire-and-forget at project creation. On first submit the row might not exist yet in Baserow, causing `doc_update` to fail. Fix: removed webhook call from `/api/project/create`; `new_order` now only fires from the submit route, which already awaits it before firing `doc_update`.
  - Bug 2: `new_order` payload sent `customer_language: "es-ES"` but system expects `locale: "es"`. Fix: renamed field to `locale` and strip region code via `.split('-')[0]`.
  - Verified by fresh sub-agent: both PASS.
  - File: `backend/server.js`

### ✅ Completed (continued)

- **[2026-04-05] Remove access token from form URLs (T001)**
  - Backend: renamed `requireProjectToken` → `requireProject`; removed all token validation — middleware now only checks project exists by code. Removed `assignMissingTokens`.
  - Frontend api.ts: `projectHeaders()` returns only Content-Type; all four API functions (`fetchProject`, `saveProgress`, `submitForm`, `preUploadAssets`) no longer send `x-project-token`.
  - Frontend App.tsx: removed `getStoredToken`, `storeToken`, `projectToken` state, URL-rewrite effect, token params from `buildProjectUrl`; `handlePhoneConfirmed` navigates to `/?code=CODE` only.
  - Frontend hooks: `useFormState`, `useBeforeUnloadSave`, `ReviewSection` — all `projectToken` params removed.
  - Backend startup logs: updated dev link format from `/?code=X&token=Y` → `/?code=X`.
  - QA verified: all checks PASS, TypeScript 0 errors.
  - Files: `backend/server.js`, `app/src/App.tsx`, `app/src/services/api.ts`, `app/src/hooks/useFormState.ts`, `app/src/hooks/useBeforeUnloadSave.ts`, `app/src/sections/ReviewSection.tsx`

- **[2026-04-05] Fix white screen on bad network — lazy chunk load failures (T002)**
  - Root cause: React.lazy() import Promises reject on bad network. Without an ErrorBoundary, the rejected Promise propagates as an uncaught render error, unmounting the entire React tree → white screen.
  - Fix layer 1: `lazyWithRetry` helper in App.tsx — retries dynamic import up to 3 times with 1s delay. Applied to all 4 lazy sections: ProvinceSelectionSection, RepresentationSection, EnergyCertificateSection, ReviewSection.
  - Fix layer 2: new `ChunkErrorBoundary` class component (`app/src/components/ChunkErrorBoundary.tsx`) — catches render errors, shows "Reintentar cargar" button that calls `window.location.reload()`. Wraps the main Suspense in FormApp and DashboardApp.
  - QA verified: all checks PASS, TypeScript 0 errors.
  - Files: `app/src/App.tsx`, `app/src/components/ChunkErrorBoundary.tsx` (new)

### ✅ Completed (continued)

- **[2026-04-06] Navigation back-button audit + handlePhoneConfirmed flash fix**
  - Deep first-principles read of entire App.tsx routing logic identified 4 bugs:
  - **Bug 1 — PropertyDocs onBack wrong target**: `source === 'assessor' ? () => goTo('phone') : undefined` sent follow-up customers to the phone-entry screen. Fixed: `followUpDocumentFlow ? () => goTo('review') : undefined`.
  - **Bug 2 — EnergyCertificate onBack wrong target in followUp**: went to `'property-docs'`. Fixed: goes to `'review'`.
  - **Bug 3 — Review onBack visible in followUp**: "Volver" button took follow-up customers back to energy-certificate. Fixed: `onBack={followUpDocumentFlow ? undefined : ...}` — button hidden in follow-up mode.
  - **Bug 4 — handlePhoneConfirmed flash**: hardcoded `goTo('property-docs')` fired before `syncInitialSection` effect corrected it — returning customers briefly saw property-docs. Fixed: `goTo(getInitialSection(normalizedProject, foundProject.code))` — no flash, direct to correct section.
  - TypeScript: 0 errors, clean Vite compile.
  - Deployed: commit `e013abb` → Railway SUCCESS (live at documentos.eltex.es).
  - File: `app/src/App.tsx`

### 📋 To Do
- None

### ✅ Completed (continued)

- **[2026-04-02] Blurry document preview fix**
  - Carousel preview used full-res PNGs downscaled to 0.25 → blurry on retina phones (2×/3× DPI)
  - Modal used 0.5 scale → still blurry on 3× screens (needs ≥2100 px, had ~700 px)
  - Fixed: `renderSignedDocumentPreview` now uses pre-baked thumbnail WebPs (11–29 KB) via `thumbnailSrcForKind`, scale=1.0 — tiny canvas, fast, no upscaling blurriness
  - Fixed: `renderSignedDocumentModalPreview` now uses full-res PNG at scale=1.0 — pixel-perfect text on all retina screens; spinner covers 300–600 ms render
  - Fixed: `spain-poder` case hardcoded template path and ignored `getSrc` — now uses `getSrc?.('spain-poder') ?? '/poder-representacio.png'`
  - File: `app/src/lib/signedDocumentOverlays.ts`

- **[2026-04-02] Signature PDF readability — tap-to-expand fullscreen modal**
  - Documents in the signing carousel were unreadable because the preview renders at 0.25 scale (quarter size) for performance — A4 text becomes too small on a phone
  - Added `renderSignedDocumentModalPreview` (0.5 scale) to `signedDocumentOverlays.ts` — sharper but still fast (~50–100ms)
  - `SignedDocumentPreview` now renders as a tappable button with a "Toca para leer" zoom-in hint overlay
  - New `DocumentFullscreenModal` component: dark overlay, document title in header, scrollable image at `width: max(100%, 700px)` so users can scroll and read the full document, close button
  - Files: `app/src/lib/signedDocumentOverlays.ts`, `app/src/sections/RepresentationSection.tsx`

---

## Session Log

### 2026-04-02 — Session: Production Readiness
- Security fixes: helmet, CORS, rate limiting, global error handler, startup validation
- Performance fix: text overlay preview was using full-res (1.0) — switched to 0.25 scale + debounce
- New tests: API-01, API-02, API-03, E2E-MOBILE-01
- Updated docs: `docs/PRODUCTION-READINESS.md`, `docs/TEST-TRACKER.md`
- Grand total: **56/56 tests passing** (33 E2E + 23 unit)

### 2026-04-05 — Session: Capture firstName, lastName, browserLanguage
- Extended all three DNI/NIE/passport AI prompts to extract `firstName` (nombre) and `lastName` (apellidos) separately — no extra API call
- `browserLanguage` captured from `navigator.language` in `initialFormData` and persisted as `project.customerLanguage` on save/submit
- `getProjectSnapshot` and `buildDashboardSummary` expose the new fields; `serializeDashboardProject` includes `customerLanguage`
- `DashboardProjectSummary` interface + `getSnapshot` + `getDashboardProjectSummary` all updated in `dashboardProject.ts`
- Dashboard detail panel: new conditional 3-column info row (Nombre / Apellidos / Idioma del navegador) with `languageLabel()` helper (Intl.DisplayNames)
- TypeScript: 0 errors; both workflows running cleanly
- Files: `backend/server.js`, `app/src/types/index.ts`, `app/src/lib/dashboardProject.ts`, `app/src/hooks/useFormState.ts`, `app/src/pages/Dashboard.tsx`

### 2026-04-06 — Session: Navigation audit + back-button fixes + ChunkErrorBoundary hardening
- First-principles read of App.tsx, Dashboard.tsx, ReviewSection, PropertyDocsSection, EnergyCertificateSection, ReviewSection — full routing picture built
- Found 4 bugs: PropertyDocs onBack → phone (wrong), EnergyCertificate onBack in followUp → property-docs (wrong), Review onBack in followUp → energy-cert (wrong), handlePhoneConfirmed flash of property-docs before syncInitialSection corrects it
- Investigated ChunkErrorBoundary "Error de carga" after signing: determined boundary catches ALL React errors (render + chunk-load). EC chunk is 20 KB — network failure is possible but unlikely. Two failure modes identified.
- Fix 1: ChunkErrorBoundary now distinguishes chunk-load errors vs render errors (`isChunkLoadError` detector), shows appropriate Spanish copy per type.
- Fix 2: lazyWithRetry upgraded from 3 attempts/2 s window → 5 attempts/10 s window (1 s, 2 s, 3 s, 4 s delays).
- Fix 3: Eager EC chunk preload fires when RepresentationSection renders — chunk guaranteed cached before user finishes signing.
- TypeScript: 0 errors after all changes.
- Files changed: `app/src/App.tsx`, `app/src/components/ChunkErrorBoundary.tsx`, `AGENTS.md`

### 2026-04-05 — Session: followUpMode representation card fix
- Root cause: `!followUpMode &&` guard in `needsRepresentation` suppressed the representation card for fully-signed customers returning to review
- Fix: removed the guard; card now shows for all relevant locations; `signaturesOk=true` puts it in COMPLETADO
- Verified via screenshot of Revisión 5/5 with Cataluña project (3 sigs done, EC skipped)
- Files: `app/src/sections/ReviewSection.tsx`

### 2026-04-04 — Session: EC wizard step persistence
- Identified that previous session had already wired `navigateToStep` and `useState(data.currentStepIndex ?? 0)` in the component
- Found remaining gap: Case 2 merge in `App.tsx` (backup and server within 500 ms) was using `...serverFd?.energyCertificate` as base but never explicitly preferring the backup's `currentStepIndex`, dropping it in the debounce window
- Fix: added `currentStepIndex: backupFd.energyCertificate?.currentStepIndex ?? serverFd?.energyCertificate?.currentStepIndex` to the merge block (parallel to `renderedDocument`)
- TypeScript: 0 errors. Files: `app/src/App.tsx`

### 2026-04-02 — Session: E2E Flow Tests Completion
- Wrote E2E-FLOW-03 (EC resume path) and E2E-FLOW-04 (follow-up path routing)
- Added 4 new backend test endpoints for state management
- Seeded ELT20250005 properly in `getDefaultProjects()`
- Fixed DASH-01/DASH-02: already implemented — confirmed and documented
- Grand total: **58/58 tests passing** (35 E2E + 23 unit)
- All To Do items cleared — Task Queue is now empty

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

### ❌ Used `reset-ec` in beforeEach while tests mutate property docs
- **When**: Writing FLOW-04 test (calls `reset-property-docs`)
- **What happened**: All subsequent tests failed because `reset-ec` only resets EC — property docs stayed cleared
- **Fix**: Changed `beforeEach` to call `restore-base-flow` which restores the full clean state
- **Rule**: If any test mutates state beyond what `beforeEach` resets, `beforeEach` must restore the FULL required state

### ❌ Called `restore-base-flow` before page navigation completed (beforeunload race)
- **When**: FLOW-04 called `restore-base-flow`, then `page.goto(form)` — form showed "Documentos"
- **What happened**: The previous `page.goto(form)` with cleared docs triggered `useBeforeUnloadSave` keepalive when navigating away. Since keepalive runs AFTER the goto promise resolves, the keepalive fetch overwrote the just-restored server state.
- **Fix**: Navigate to `about:blank` FIRST (flushes beforeunload with old state), THEN call `restore-base-flow`, THEN navigate to form
- **Rule**: When testing flows that involve multiple page.goto calls on the same project, always flush beforeunload before restoring server state

### ❌ Called `renderSignedDocumentOverlay` (full-res) for live preview
- **When**: Original implementation of `SignedDocumentPreview`
- **What happened**: 300–600ms render on every signature stroke — UI froze
- **Fix**: Use `renderSignedDocumentPreview` (0.25 scale) for previews; full-res only on final commit
- **Rule**: Preview = `renderSignedDocumentPreview`. Final artifact = `renderSignedDocumentOverlay`.

### ❌ Hardcoded template path in `spain-poder` fallback, ignoring `getSrc`
- **When**: Adding `getSrc` support to `renderSignedDocumentOverlayAtScale`
- **What happened**: All `if (kind === ...)` blocks correctly used `getSrc?.(...) ?? defaultSrc`, but the final `spain-poder` fallback was a `return renderTemplate('/poder-representacio.png', ...)` — hardcoded, no `getSrc` call
- **Fix**: Extract `const poderSrc = getSrc?.('spain-poder') ?? '/poder-representacio.png'` before the `renderTemplate` call
- **Rule**: Any `getSrc` resolver must be applied to ALL document kinds, including the fallback case at the bottom

### ❌ Added import before creating the file
- **When**: Adding `useDebounce` import to `RepresentationSection.tsx`
- **What happened**: Vite HMR error — module not found
- **Fix**: Create the file first, then add the import

### ❌ `handlePhoneConfirmed` hardcoded `goTo('property-docs')` — flash for returning users
- **When**: Initial implementation of phone-confirm flow
- **What happened**: `goTo('property-docs')` set section immediately; `syncInitialSection` useEffect corrected it a render later → visible flash of wrong section for returning customers
- **Fix**: Call `goTo(getInitialSection(normalizedProject, foundProject.code))` directly — skip the intermediate wrong state
- **Rule**: Never hardcode a section destination when `getInitialSection` is available. Always derive the target from project state.

### ❌ Back buttons routed to wrong sections in follow-up mode
- **When**: Original implementation assumed linear forward flow for all users
- **What happened**: PropertyDocs back → 'phone' (assessor source). EnergyCertificate back → 'property-docs'. Review back → 'energy-certificate'. All wrong for follow-up users who land on 'review' and navigate outward.
- **Fix**: Check `followUpDocumentFlow` first. If true: back always goes to 'review' (or no back button on review itself).
- **Rule**: In follow-up mode the user's home base is 'review'. ALL back buttons in sub-sections must return to 'review', not to the "next step behind" in the linear flow.

### ❌ ChunkErrorBoundary caught render errors and blamed the user's internet
- **When**: Post-signing transition to EnergyCertificateSection (2026-04-06)
- **What happened**: The boundary catches ALL React errors (render errors + chunk-load failures). A runtime crash inside EnergyCertificateSection would show "Algo fue mal al cargar esta sección. Esto suele ocurrir debido a una mala conexión a internet." — a completely wrong diagnosis that blocks the user from understanding or recovering.
- **Fix**: `getDerivedStateFromError` now calls `isChunkLoadError(error)` which checks for "failed to fetch", "dynamically imported", etc. Different copy shown per error type.
- **Rule**: Error boundaries that wrap `React.lazy` MUST distinguish chunk-load errors (network) from render errors (bugs). The messages and recovery paths are different.

### ❌ lazyWithRetry had only 3 attempts over 2 seconds — too fragile for mobile
- **When**: Post-signing transition on mobile (2026-04-06)
- **What happened**: Mobile networks can drop for 3–10 s on handover or signal loss. 3 total attempts at 1 s intervals gave only a 2 s window — if all failed, React.lazy permanently rejected the lazy component. Recovery requires a full page reload.
- **Fix**: Increased to 5 total attempts with 1 s / 2 s / 3 s / 4 s delays = 10 s window.
- **Rule**: lazyWithRetry needs ≥ 5 attempts with increasing delays to be useful on mobile networks.

### ❌ `serializeProject` omitted `assetFiles` — dashboard could not see uploaded files
- **When**: Dashboard showed "No se encontraron archivos descargables" on every document action
- **What happened**: Auto-save strips `preview` from formData (keeps payloads small). Photos are uploaded separately via `preUploadAssets` → stored as binary files at `/uploads/assets/:code/` with paths in `project.assetFiles`. But `serializeProject` (used by `/api/dashboard/project/:code`) never included `assetFiles`, so the frontend only searched stripped formData and found nothing.
- **Fix**: Added `assetFiles` to `serializeProject`; updated `buildDashboardSummary` present-flags; updated `getDocumentAssetsFromProject`/`getElectricityAssetsFromProject` to fall back to assetFiles paths; proxied `/uploads` in Vite dev
- **Rule**: If you add a new storage mechanism for binary assets, ensure `serializeProject` exposes it AND the dashboard resolution functions handle it
