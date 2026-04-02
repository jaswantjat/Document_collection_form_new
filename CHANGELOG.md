# CHANGELOG
> This is the AI agent's handoff log. Every session must append an entry here before finishing.
> Format: `[Date] [Phase] — What was done — Files changed — What's next`

---

## 2026-04-02 — Session: Production Readiness & Bug Fixes

**Phase**: Developer + QA

**What was done:**
- Added `helmet` middleware (security headers) to backend
- Restricted CORS to `ALLOWED_ORIGINS` env var
- Rate limiting on AI extraction and PDF endpoints (skipped in dev)
- Global error handler middleware added
- Startup env-var validation (exits in prod if required keys missing)
- Changed AI model default to stable `google/gemini-2.0-flash`
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
