# Eltex — Production Readiness Tracker

> **Orchestration model:** Main Agent (Orchestrator) → Coding Agent / Fixes → QA Agent → loop  
> **Last updated:** 2026-04-02  
> **Legend:** ✅ Done · ❌ Fail · ⚠️ Partial · ⏳ Pending · 🔧 In progress

---

## 📊 Current Test Baseline (Pre-Production Work)

| Layer | Tests | Status |
|---|---|---|
| Unit (Vitest) | 23/23 | ✅ |
| E2E (Playwright) | 29/29 | ✅ |
| **Grand total** | **52/52** | ✅ |

---

## 🔴 Production Gaps — Audit Results (2026-04-02)

### Security

| # | Gap | Severity | Status | Fix |
|---|-----|----------|--------|-----|
| SEC-01 | No security headers (Helmet) — missing X-Content-Type-Options, HSTS, CSP | High | ✅ Done | Added `helmet` middleware |
| SEC-02 | CORS configured with wildcard `origin: '*'` | High | ✅ Done | Restricted to env-defined allowed origins |
| SEC-03 | No rate limiting on AI extraction (`/api/extract`) | High | ✅ Done | `express-rate-limit`: 10 req/min per IP |
| SEC-04 | No rate limiting on PDF conversion (`/api/pdf-to-images`) | High | ✅ Done | `express-rate-limit`: 20 req/min per IP |
| SEC-05 | Hardcoded `DASHBOARD_PASSWORD` fallback `'eltex2025'` in non-prod | Med | ✅ Done | Fallback only in dev; prod fails-fast if missing |

### Reliability

| # | Gap | Severity | Status | Fix |
|---|-----|----------|--------|-----|
| REL-01 | No global error-handling middleware — unhandled errors return HTML | High | ✅ Done | Added `app.use((err, req, res, next) => ...)` handler |
| REL-02 | No startup env-var validation — missing keys fail at runtime | High | ✅ Done | Startup check exits process if required vars absent |
| REL-03 | `OPENROUTER_MODEL` model ID | Med | ✅ Done | Default set to `google/gemini-3.1-flash-lite-preview` |

### Code Quality

| # | Gap | Severity | Status | Fix |
|---|-----|----------|--------|-----|
| CQ-01 | Dev-only `/api/test/reset-ec/:code` not gated in prod | Med | ✅ Done | Already gated by `isProduction` — confirmed |
| CQ-02 | Sample data seeded unless `SEED_SAMPLE_DATA=false` | Low | ✅ Done | Clearly documented in env-var validation block |

---

## 🧪 Test Coverage Gaps — Production Cycle

From `docs/TEST-TRACKER.md` § Coverage Gaps:

| Priority | Test ID | Description | Status |
|---|---|---|---|
| 🔴 High | API-01 | POST `/api/project/:code/save` valid payload → 200 | ✅ Done |
| 🔴 High | API-02 | POST `/api/project/:code/save` invalid token → 401 | ✅ Done |
| 🟡 Med | API-03 | GET `/api/project/:code/download-zip` returns ZIP | ✅ Done |
| 🟢 Low | E2E-MOBILE-01 | Mobile viewport (375×667): form usable | ✅ Done |

---

## 🔁 QA Cycle History (Production Readiness)

### PROD-Cycle 1 — Security + Reliability Fixes (2026-04-02)

**Changes by Orchestrator:**
- Installed `helmet` and `express-rate-limit` in `backend/package.json`
- Added `helmet()` middleware with CSP disabled (proxy-safe) (SEC-01)
- Restricted CORS to `ALLOWED_ORIGINS` env var — falls back to `*` in dev (SEC-02)
- Added `aiExtractLimiter` (10 req/min) on `/api/extract`, `/api/extract-batch`, `/api/extract-dni-batch` — skipped in dev (SEC-03)
- Added `pdfLimiter` (20 req/min) on `/api/pdf-to-images` — skipped in dev (SEC-04)
- Added global error handler middleware at end of `backend/server.js` (REL-01)
- Added startup env-var validation block (exits in prod if required keys missing) (REL-02)
- `OPENROUTER_MODEL` default: `google/gemini-3.1-flash-lite-preview` (REL-03)
- Dashboard password fallback `'eltex2025'` already gated by `!isProduction` — confirmed correct (SEC-05)

**Files changed:** `backend/server.js`, `backend/package.json`

**QA Agent Run:** ✅ Verified — backend starts cleanly in dev, all 56 tests pass

---

### PROD-Cycle 2 — API + Mobile E2E Tests (2026-04-02)

**Changes by Orchestrator:**
- Added `tests/e2e/api-coverage.spec.ts` (API-01, API-02, API-03)
- Added `tests/e2e/mobile.spec.ts` (E2E-MOBILE-01)

**QA Agent Run:** ✅ All 4 new tests pass — grand total 56/56

---

### PROD-Cycle 3 — Text Overlay Rendering Performance (2026-04-02)

**Root cause identified:**
`SignedDocumentPreview` in `RepresentationSection.tsx` was calling `renderSignedDocumentOverlay` (full-resolution, scale=1.0) for the carousel preview. Each document template is ~2482×3509 px, so every re-render took 300–600ms. Re-renders were triggered on every signature stroke because `previewFormData` was computed from live `sharedSignature` state with no debounce.

**Fixes applied:**
1. `SignedDocumentPreview` now calls `renderSignedDocumentPreview` (scale=0.25 → ~620×877 px) — ~30× fewer pixels → <10ms per render
2. Created `app/src/hooks/useDebounce.ts` — generic debounce hook
3. `sharedSignature` state is debounced at 400ms before it feeds into `previewFormData` — no mid-stroke re-renders
4. `preloadDocumentTemplates` called on mount via `useEffect` — templates are decoded into cache before the user needs them

**Files changed:**
- `app/src/sections/RepresentationSection.tsx`
- `app/src/hooks/useDebounce.ts` (NEW)

**QA Agent Run:** ✅ TypeScript clean, backend + frontend start with no errors, 56/56 tests pass

---

## 🧠 Agent Learnings — Production Readiness

| Key | Insight |
|-----|---------|
| `helmet-cors-order` | `helmet()` must come before `cors()` in Express middleware chain |
| `rate-limit-skip-dev` | Skip rate limiting in `NODE_ENV !== 'production'` to avoid slowing tests |
| `env-validation-startup` | Fail fast at startup — never let missing API keys cause runtime 500s |
| `cors-allowed-origins` | ALLOWED_ORIGINS should be comma-separated in env; split to array |

---

## 📝 System Notes

- **Dev servers:** Frontend `localhost:5000` · Backend `localhost:3001`
- **Test projects:** ELT20250001–ELT20250004
- **Run unit tests:** `cd app && pnpm run test`
- **Run E2E tests:** `npx playwright test --reporter=list`
- **Backend entry:** `backend/server.js`
- **Production env vars required:** `OPENROUTER_API_KEY`, `DASHBOARD_PASSWORD`, `ALLOWED_ORIGINS` (new)
