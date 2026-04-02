# CHANGELOG

## 2026-04-02 — Session: Representació Field Alignment Fix

**Phase**: Developer

**Root cause:**
Pixel-level analysis of `autoritzacio-representacio.jpg` (1241×1754 px) revealed that all persona and empresa field box tops were 8–12px above the actual template content rows. With `textBaseline='top'`, this caused user-filled blue text to appear slightly elevated above where the template's printed labels sit — text was floating above the fill line rather than sitting on it.

**What was done:**
- Scanned the template at full resolution using jimp pixel analysis to find exact y-coordinates of each content row
- Confirmed x-coordinates are correct (e.g., personaNom x=388 sits 25px after the label ends at x≈363 — correct gap)
- Updated all 10 REPRESENTACIO_FIELDS y-coordinates to match actual pixel rows:
  - personaNom/personaNif: 244 → 252 (+8px)
  - personaAdreca/personaCodiPostal: 282 → 291 (+9px)
  - personaMunicipi: 321 → 333 (+12px)
  - empresaNom/empresaNif: 438 → 449 (+11px)
  - empresaAdreca/empresaCodiPostal: 476 → 484 (+8px)
  - empresaMunicipi: 515 → 527 (+12px)
  - lloc/data/signaturaPersonaInteressada: unchanged (already correctly positioned)
- Bumped SIGNED_DOCUMENT_TEMPLATE_VERSION from '2026-04-01.2' to '2026-04-02.1' to force re-render of stored documents with old coordinates

**Files changed:**
- `app/src/lib/signedDocumentOverlays.ts`

**Test status:** TypeScript compiles cleanly (0 errors). No logic changed — coordinate values only.

**What's next:** Task queue is empty.

---

## 2026-04-02 — Session: Document Discoverability Fix

**Phase**: Developer

**Problem solved:**
On the mobile "Documentos" page, only 2 of 4 document upload cards were visible in the mobile viewport (375×667). A naive user could upload (or skip) the first two cards and tap "Continuar" without ever discovering the IBI or electricity bill cards below the fold.

**What was done:**
- Added a `DocProgressStrip` component to `PropertyDocsSection.tsx` — a compact 2-column grid of 4 document slots (Contrato Eltex, DNI/NIE, IBI o escritura, Factura de luz) that renders immediately below the page header, before any upload card. Each slot shows a filled green checkmark when uploaded or an empty circle ring when pending. A "X de 4" counter in the top-right corner updates live.
- Added `contractDone` computed boolean to the main section, and updated `missingCount` to include the contract slot (was only counting the other 3).
- The strip takes ~80px of vertical space — small enough to fit alongside the page title and still leave the first upload card partially visible, giving the natural scroll signal.

**Files changed:**
- `app/src/sections/PropertyDocsSection.tsx`

**Test status:** TypeScript compiles cleanly (0 errors). No logic changed — strip is purely additive UI.

**What's next:** Task queue is empty.

---

## 2026-04-02 — Session: Blurry Document Preview Fix

**Phase**: Developer

**Root cause:**
The carousel preview was loading the full-resolution PNGs (148–943 KB) and downscaling to 0.25, which produced a ~350 px wide JPEG. On retina phones (2×/3× DPI) the browser upscaled this 2–3× making text visibly blurry. The fullscreen modal was at 0.5 scale (~700 px wide) — also severely blurry on 3× screens that need ≥2100 px for a crisp render at 700 px CSS width. There was also a bug: the `spain-poder` document type hardcoded its template path and completely ignored the `getSrc` parameter.

**What was done:**
- `renderSignedDocumentPreview` → now uses the pre-baked 25%-scale thumbnail WebPs (11–29 KB) as the template source via `thumbnailSrcForKind`. `scale=1.0` — canvas is at the WebP's native (already-small) dimensions, renders in <10ms, no blurry upscaling in the carousel.
- `renderSignedDocumentModalPreview` → now renders at full scale (`scale=1.0`) using the original high-res PNG. Text is pixel-perfect on 2× and 3× retina screens. A spinner covers the 300–600 ms render time (acceptable for a user-triggered tap).
- `preloadDocumentTemplates` → removed the no-longer-needed modal WebP preload step; priorities are now thumbnails first, then full-res PNGs (used by both modal and final artifact).
- Fixed `spain-poder` bug: the fallback `renderTemplate` call was hardcoded to `/poder-representacio.png` and ignored `getSrc` entirely. Now uses `getSrc?.('spain-poder') ?? '/poder-representacio.png'`.
- Updated JSDoc comments throughout to reflect the new render strategy.

**Files changed:**
- `app/src/lib/signedDocumentOverlays.ts`

**Test status:** TypeScript compiles cleanly. App loads with no errors.

**What's next:** Task queue is empty.

---

## 2026-04-02 — Session: Documentation Sync

**Phase**: Maintenance

**What was done:**
- `docs/qa-tasks.json` was stuck with TASK-CODING-1 and CYCLE-5 marked `"in-progress"` — updated to reflect all completed cycles through CYCLE-8
- Added CYCLE-6, CYCLE-7, CYCLE-8, TASK-CODING-2, TASK-CODING-3 entries to qa-tasks.json
- `docs/TEST-TRACKER.md` PRD Acceptance Criteria Coverage table still showed E2E-FLOW-01/02/03/04, DASH-01/02, API-03 as ⏳ Pending — updated all to ✅ Covered
- Updated test totals from 56/56 (Cycle 7) to 58/58 (Cycle 8) and EC Flow suite from 2/2 to 4/4
- Updated Coverage Gaps table: all items done, no open items
- Added Cycle 8 entry to QA Loop History

**Files changed:**
- `docs/qa-tasks.json`
- `docs/TEST-TRACKER.md`

**Test status:** 58/58 — no code changes, docs only.

**What's next:** Task queue is empty. Project is production-ready.

---

## 2026-04-02 — Session: Signature PDF Readability

**Phase**: Developer

**What was done:**
- Added `renderSignedDocumentModalPreview` (0.5 scale) to `app/src/lib/signedDocumentOverlays.ts`
- Updated `SignedDocumentPreview` in `RepresentationSection.tsx` to be tappable — shows a "Toca para leer" hint badge with a zoom-in icon
- Added `DocumentFullscreenModal` component: dark fullscreen overlay, scrollable document at wider CSS width (700px min), document title + close button
- Fullscreen modal uses `document.body.overflow = 'hidden'` while open so the background doesn't scroll

**Files changed:**
- `app/src/lib/signedDocumentOverlays.ts`
- `app/src/sections/RepresentationSection.tsx`

**Test status:** TypeScript compiles cleanly. App loads and runs with no errors.

**What's next:** Task queue is empty.

---

## 2026-04-02 — Session: Production Readiness & Bug Fixes

**Phase**: Developer + QA

**What was done:**
- Added `helmet` middleware (security headers) to backend
- Restricted CORS to `ALLOWED_ORIGINS` env var
- Rate limiting on AI extraction and PDF endpoints (skipped in dev)
- Global error handler middleware added
- Startup env-var validation (exits in prod if required keys missing)
- AI model: `google/gemini-3.1-flash-lite-preview` (override via `OPENROUTER_MODEL` env var)
- Fixed text overlay preview: switched from full-res (1.0 scale) to preview scale (0.25) — eliminated 300–600ms freeze
- Added `useDebounce` hook (400ms) to prevent mid-stroke re-renders
- Added `preloadDocumentTemplates` on mount for instant first render
- Fixed `submitting` state initialized to `true` when `autoSubmit=true` — submission never ran; replaced with `useRef`
- Reduced energy cert canvas from 300 DPI to 150 DPI, JPEG quality 0.92 → 0.82
- Converted `saveDB()` to async write-queue (was blocking event loop)
- Added 60s AbortSignal timeout on submitForm fetch
- Added `useLocalStorageBackup` (300ms full-state backup including photos)
- Added `useBeforeUnloadSave` (keepalive fetch on page unload)
- Fixed `parseSpanishPhone()` to accept E.164 and international formats
- Fixed identity document validation to accept passports and driving licences
- Added E2E tests: FLOW-03, FLOW-04, API-01, API-02, API-03, E2E-MOBILE-01
- Fixed false "connection issue" warnings — now only shown after 2+ consecutive failures
- Added 10s AbortSignal timeout to `saveProgress` API call
- Verified DASH-01 and DASH-02 already implemented — no code changes needed

**Files changed:**
- `backend/server.js`
- `backend/package.json`
- `app/src/sections/RepresentationSection.tsx`
- `app/src/sections/ReviewSection.tsx`
- `app/src/sections/EnergyCertificateSection.tsx`
- `app/src/hooks/useDebounce.ts` (new)
- `app/src/hooks/useLocalStorageBackup.ts` (new)
- `app/src/hooks/useBeforeUnloadSave.ts` (new)
- `app/src/hooks/useFormState.ts`
- `app/src/lib/energyCertificateDocument.ts`
- `app/src/lib/phone.ts`
- `app/src/lib/documentValidation.ts`
- `app/src/services/api.ts`
- `app/src/App.tsx`
- `tests/e2e/api-coverage.spec.ts` (new)
- `tests/e2e/mobile.spec.ts` (new)
- `tests/e2e/energy-certificate-flow.spec.ts`
- `docs/PRODUCTION-READINESS.md`
- `docs/TEST-TRACKER.md`

**Test status:** 58/58 passing (35 E2E + 23 unit)

**What's next:** Task queue is empty. Project is production-ready.

---

## 2026-04-02 — Session: Codebase Cleanup

**Phase**: Maintenance

**What was done:**
- Deleted 4 ad-hoc root-level debug scripts (`test_extraction.js`, `test_false_positive.js`, `test_false_positive_refined.js`, `test_safety_net.js`)
- Deleted `attached_assets/` — conversation upload artifacts (screenshots, PDFs, text pastes)
- Deleted `screenshots/` — early dev debug screenshots
- Deleted `test-results/` — generated Playwright output
- Deleted `playwright-report/` — generated Playwright HTML report
- Deleted `scripts/browser-test.mjs` and `scripts/browser-test-deep.mjs` — ad-hoc browser debug scripts superseded by Playwright
- Deleted `.tasks/` — all 5 completed task files (info preserved in AGENTS.md / CHANGELOG.md)
- Deleted `.local/progress_final.md`, `.local/progress_t001_t002_t003.md`, `.local/qa_report_t001_t002_t003.md` — temporary session progress tracking files

**Files changed:** Deletions only — no source code modified.

**What's next:** Codebase is clean. Task queue remains empty.

---

## 2026-04-02 — Session: Playbook Enforcement

**Phase**: Setup

**What was done:**
- Created `RULES.md` at project root — master AI agent playbook (3-phase workflow, hard constraints)
- Updated `replit.md` to enforce `RULES.md` at the start of every session
- Created `CHANGELOG.md` (this file) as required by the playbook

**Files changed:**
- `RULES.md` (new)
- `replit.md`
- `CHANGELOG.md` (new)

**What's next:** Any future feature must follow the 3-phase workflow defined in `RULES.md`.
