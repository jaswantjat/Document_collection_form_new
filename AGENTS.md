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
| `OPENROUTER_MODEL` | optional | AI model (default: `google/gemini-3.1-flash-lite-preview`) |
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

### 🔧 In Progress
- None

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
- **Rule**: Create the module before importing it.
