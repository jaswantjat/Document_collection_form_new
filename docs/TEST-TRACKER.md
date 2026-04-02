# Eltex — Test Tracker & QA Checklist

> **Orchestration model:** Main Agent (Orchestrator) → Coding Agent → QA Agent → loop  
> **Last updated:** 2026-04-02  
> **Legend:** ✅ Pass · ❌ Fail · ⚠️ Flaky/Warning · 🔄 Running · ⏳ Pending · 🔧 Fix in progress

---

## 📋 Current Status — All Green ✅

| Layer | Test Type | Suite | Tests | Status |
|---|---|---|---|---|
| Unit | Vitest | Energy Certificate Validation | 10/10 | ✅ All Pass |
| E2E | Playwright | Smoke | 3/3 | ✅ All Pass |
| E2E | Playwright | Form Navigation | 2/2 | ✅ All Pass |
| E2E | Playwright | Form Diagnosis (T01–T12) | 12/12 | ✅ All Pass |
| **Total** | | | **27/27** | ✅ |

---

## 🔁 QA Loop History

### Cycle 0 — Unit Tests Baseline (2026-04-02)

> Run by: Orchestrator directly via Vitest  
> Result: **10/10 PASS**

| # | Test ID | Description | Result |
|---|---|---|---|
| 1 | UNIT-01 | Door material validation — empty → error | ✅ |
| 2 | UNIT-02 | Door material validation — filled → no error | ✅ |
| 3 | UNIT-03 | Equipment details — empty → error | ✅ |
| 4 | UNIT-04 | Equipment details — filled → no error | ✅ |
| 5 | UNIT-05 | AC details — true + empty → error | ✅ |
| 6 | UNIT-06 | AC details — true + filled → no error | ✅ |
| 7 | UNIT-07 | AC details — false → no error | ✅ |
| 8 | UNIT-08 | Solar panel details — true + empty → error | ✅ |
| 9 | UNIT-09 | Solar panel details — true + filled → no error | ✅ |
| 10 | UNIT-10 | Solar panel details — false → no error | ✅ |

---

### Cycle 1 — E2E Baseline (2026-04-02)

> Run by: **QA Agent** (independent, separate context)  
> Result: **16/17 PASS — 1 failure found**

| Test ID | Test Name | Status | Notes |
|---|---|---|---|
| SMOKE-01 | App loads and shows form | ✅ | |
| SMOKE-02 | HTTP 200 on port 5000 | ✅ | |
| SMOKE-03 | Backend /api health | ✅ | |
| NAV-01 | Redirects when code missing | ✅ | |
| NAV-02 | Error/loading for unknown project | ✅ | |
| DIAG-T01 | No params → phone section | ✅ | |
| DIAG-T02 | ELT20250001 smart routing | ✅ | Landed on "Documentos para firmar" |
| DIAG-T03 | ELT20250002 smart routing | ✅ | Landed on "Confirma tu documentación" |
| DIAG-T04 | Phone section: type + submit | ✅ | |
| DIAG-T05 | Property docs: all cards visible | ✅ | |
| DIAG-T06 | ELT20250001: full page scroll | ✅ | |
| DIAG-T07 | ELT20250003: third project routing | ✅ | Landed on "Documentos" |
| DIAG-T08 | Backend API data for ELT20250001 | ❌ | Timeout 15000ms — wrong URL + wrong header |
| DIAG-T09 | Invalid code shows error state | ✅ | |
| DIAG-T10 | /dashboard route renders | ✅ | |
| DIAG-T11 | Signing section: sign button | ✅ | |
| DIAG-T12 | No unexpected JS console errors | ✅ | 0 errors |

**Issue Found:**
> `DIAG-T08` — `TimeoutError: 15000ms exceeded` hitting `http://localhost:3001/api/projects/ELT20250001`

---

### Fix — Coding Agent (2026-04-02)

> Fix by: **Coding Agent** (separate context)  
> File: `tests/e2e/form-diagnosis.spec.ts`

**Root causes identified:**
1. URL was `/api/projects/:code` (plural) — correct path is `/api/project/:code` (singular)
2. Auth header was `x-token` — backend expects `x-project-token`
3. No explicit timeout on the request — added `timeout: 30000`

**Fix applied:**
```typescript
// Before
const res1 = await request.get('http://localhost:3001/api/projects/ELT20250001', {
  headers: { 'x-token': TOKEN_1 },
  failOnStatusCode: false,
});

// After
const res1 = await request.get('http://localhost:3001/api/project/ELT20250001', {
  headers: { 'x-project-token': TOKEN_1 },
  failOnStatusCode: false,
  timeout: 30000,
});
```

---

### Cycle 2 — E2E Verification (2026-04-02)

> Run by: **QA Agent** (independent, separate context)  
> Result: **17/17 PASS ✅**

| Test ID | Test Name | Status | Notes |
|---|---|---|---|
| SMOKE-01 | App loads and shows form | ✅ | |
| SMOKE-02 | HTTP 200 on port 5000 | ✅ | |
| SMOKE-03 | Backend /api health | ✅ | |
| NAV-01 | Redirects when code missing | ✅ | |
| NAV-02 | Error/loading for unknown project | ✅ | |
| DIAG-T01 | No params → phone section | ✅ | |
| DIAG-T02 | ELT20250001 smart routing | ✅ | "Documentos para firmar" |
| DIAG-T03 | ELT20250002 smart routing | ✅ | "Confirma tu documentación" |
| DIAG-T04 | Phone section: type + submit | ✅ | |
| DIAG-T05 | Property docs: all cards visible | ✅ | |
| DIAG-T06 | ELT20250001: full page scroll | ✅ | |
| DIAG-T07 | ELT20250003: third project routing | ✅ | "Documentos" |
| DIAG-T08 | Backend API data for ELT20250001 | ✅ | Status 200, keys: [success, project] |
| DIAG-T09 | Invalid code shows error state | ✅ | h1: "Enlace no válido" |
| DIAG-T10 | /dashboard route renders | ✅ | h1: "Acceso al panel" |
| DIAG-T11 | Signing section: sign button | ✅ | Arrow + swipe hint visible |
| DIAG-T12 | No unexpected JS console errors | ✅ | 0 errors |

**Total: 17/17 — Loop closed, no more issues.**

---

## 🐛 Issues Found & Fixed

| Issue ID | Description | Cycle Found | Cycle Fixed | Files Changed |
|---|---|---|---|---|
| BUG-T08-A | DIAG-T08: wrong API URL (`/api/projects/` → `/api/project/`) | Cycle 1 | Cycle 2 | `tests/e2e/form-diagnosis.spec.ts` |
| BUG-T08-B | DIAG-T08: wrong auth header (`x-token` → `x-project-token`) | Cycle 1 | Cycle 2 | `tests/e2e/form-diagnosis.spec.ts` |
| BUG-T08-C | DIAG-T08: no timeout on direct request (added `timeout: 30000`) | Cycle 1 | Cycle 2 | `tests/e2e/form-diagnosis.spec.ts` |

---

## 📊 Coverage Gaps & Upcoming Tests

> Tests that should be added in future cycles (prioritized).

- [ ] **API-01** — POST `/api/project/:code/save`: valid payload returns 200
- [ ] **API-02** — POST `/api/project/:code/save`: invalid token returns 401
- [ ] **API-03** — GET `/api/projects/:code/export`: returns ZIP  
- [ ] **UNIT-11** — `energyCertificateDocument.ts`: canvas output is valid base64 JPEG
- [ ] **UNIT-12** — Signature canvas serialization round-trip
- [ ] **E2E-FLOW-01** — Full happy path: phone → DNI → IBI → bill → sign → submit (ELT20250002)
- [ ] **E2E-FLOW-02** — Energy certificate survey: all 3 steps + signature + submit
- [ ] **E2E-FLOW-03** — Dashboard login → project list → open detail → export ZIP
- [ ] **E2E-REGION-01** — Catalonia flow: regional representation document renders
- [ ] **E2E-REGION-02** — Madrid flow: regional representation document renders
- [ ] **E2E-MOBILE-01** — Mobile viewport (375×667): form usable on iPhone SE

---

## 📝 System Notes

- **Orchestration:** Main Agent → Coding Agent → QA Agent (each with separate context)
- **Test servers:** Frontend `localhost:5000` (Vite) | Backend `localhost:3001` (Express)
- **Test data:** ELT20250001 (solar) · ELT20250002 (aerothermal) · ELT20250003 (solar)
- **Screenshots saved to:** `test-results/diagnosis-screenshots/`
- **Playwright report:** `playwright-report/index.html`
- **Unit tests:** `cd app && pnpm run test`
- **E2E tests:** `npx playwright test --reporter=list`
