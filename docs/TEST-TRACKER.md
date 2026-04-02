# Eltex — Test Tracker & QA Checklist

> **Orchestration model:** Main Agent (Orchestrator) → Coding Agent → QA Agent → loop  
> **Last updated:** 2026-04-02  
> **Legend:** ✅ Pass · ❌ Fail · ⚠️ Flaky · ⏳ Pending · 🔧 In progress

---

## 📋 Current Status — Cycle 5 In Progress ⏳

| Layer | Suite | Tests | Status |
|---|---|---|---|
| Unit (Vitest) | Energy Certificate Validation | 10/10 | ✅ |
| Unit (Vitest) | Conditional Visibility Mirror | 6/6 | ⏳ Pending |
| Unit (Vitest) | Phone Parsing (`parsePhone`) | 7/7 | ✅ |
| E2E (Playwright) | Smoke | 3/3 | ✅ |
| E2E (Playwright) | Form Navigation | 2/2 | ✅ |
| E2E (Playwright) | Form Diagnosis (T01–T12) | 12/12 | ✅ |
| E2E (Playwright) | Energy Certificate PRD | 4/4 | ✅ |
| E2E (Playwright) | Conditional Visibility (COND fixes) | 3/3 | ⏳ Pending |
| E2E (Playwright) | Bug Regressions | 3/3 | ✅ |
| **Existing total** | | **41/41** | ✅ |
| **New total (after Cycle 5)** | | **50/50** | ⏳ Pending |

---

## 🗺️ PRD Acceptance Criteria Coverage

From `docs/prds/energy-certificate-survey-v1-prd.md` § QA and Regression Protection:

| PRD Criterion | Test(s) | Status |
|---|---|---|
| Verify full completion path | ⏳ E2E-FLOW-02 (future) | ⏳ Not yet automated |
| Verify skip path | EC-01 (partial — sees skip button if on EC step) | ⚠️ Partial |
| Verify resume path | ⏳ E2E-FLOW-03 (future) | ⏳ Not yet automated |
| Verify follow-up path | ⏳ E2E-FLOW-04 (future) | ⏳ Not yet automated |
| Verify dashboard preview/download | EC-02, EC-03 (login gate only) | ⚠️ Partial |
| Verify ZIP export | ⏳ API-03 (future) | ⏳ Not yet automated |
| Verify no regression in representation flows | T01–T12 (smoke + routing) | ✅ Covered |

---

## 🔁 QA Loop History

### Cycle 0 — Unit Tests Baseline (2026-04-02)

> Run by: Orchestrator directly · **10/10 PASS**

| Test ID | Description | Result |
|---|---|---|
| UNIT-01 | Door material — empty → error | ✅ |
| UNIT-02 | Door material — filled → no error | ✅ |
| UNIT-03 | Equipment details — empty → error | ✅ |
| UNIT-04 | Equipment details — filled → no error | ✅ |
| UNIT-05 | AC details — enabled + empty → error | ✅ |
| UNIT-06 | AC details — enabled + filled → no error | ✅ |
| UNIT-07 | AC details — disabled → no error | ✅ |
| UNIT-08 | Solar panel details — enabled + empty → error | ✅ |
| UNIT-09 | Solar panel details — enabled + filled → no error | ✅ |
| UNIT-10 | Solar panel details — disabled → no error | ✅ |

---

### Cycle 1 — E2E Baseline (2026-04-02)

> Run by: **QA Agent** (separate context) · **16/17 — 1 failure**

| Test ID | Test Name | Status | Notes |
|---|---|---|---|
| SMOKE-01–03 | Smoke suite | ✅ | |
| NAV-01–02 | Form navigation | ✅ | |
| DIAG-T01–T07 | Form diagnosis routing | ✅ | |
| DIAG-T08 | Backend API for ELT20250001 | ❌ | Timeout 15s — wrong URL + wrong header |
| DIAG-T09–T12 | Form diagnosis errors / dashboard / console | ✅ | |

---

### Fix — Coding Agent (2026-04-02)

> **DIAG-T08** root causes: wrong path (`/api/projects/` → `/api/project/`), wrong header (`x-token` → `x-project-token`), no timeout (added `timeout: 30000`)

---

### Cycle 2 — E2E Verification (2026-04-02)

> Run by: **QA Agent** · **17/17 PASS ✅**

---

### Cycle 3 — Full Suite + New Tests (2026-04-02)

> Run by: **QA Agent** · **23/24 — 1 failure (REG-03)**

New tests added by **Coding Agent** from PRD & bug-fix docs:
- `tests/e2e/energy-certificate.spec.ts` (EC-01 to EC-04)
- `tests/e2e/bug-regressions.spec.ts` (REG-01 to REG-03)
- `app/src/lib/phone.test.ts` (UNIT-PHONE-01 to 07)

**Unit tests (17/17 pass)** including all 7 new phone parsing tests.

**REG-03 failure:** Test incorrectly assumed `HTTP 200` for phone-not-found — backend returns `HTTP 404` (correct behavior). Root cause: wrong test expectation, not a code bug.

---

### Fix — Orchestrator (2026-04-02)

> **REG-03** expectation corrected: `expect([200, 404]).toContain(res.status())` with body check for `NOT_FOUND` on 404s.

---

### Cycle 4 — Final Verification (2026-04-02)

> Run by: **QA Agent** · **24/24 PASS ✅** — Loop closed.

| Test ID | Suite | Test Name | Status |
|---|---|---|---|
| REG-01 | Bug Regressions | International phones accepted by backend normalizePhone | ✅ |
| REG-02 | Bug Regressions | Wrong token returns 401/403 (not 200) | ✅ |
| REG-03 | Bug Regressions | International phone format accepted (not rejected) | ✅ |
| EC-01 | Energy Certificate | Skip path accessible | ✅ |
| EC-02 | Energy Certificate | Dashboard pending status | ✅ |
| EC-03 | Energy Certificate | Dashboard login gate renders | ✅ |
| EC-04 | Energy Certificate | Invalid code → "Enlace no válido" | ✅ |
| DIAG-T01–T12 | Form Diagnosis | Full diagnostic suite | ✅ |
| NAV-01–02 | Form Navigation | Navigation routing | ✅ |
| SMOKE-01–03 | Smoke | App + backend health | ✅ |

---

### Fix — Conditional Field Visibility (2026-04-02, commit 0bb7801)

> Applied by: **Orchestrator (Main Agent)** · 3 UI rendering bugs fixed in `EnergyCertificateSection.tsx`

| Bug ID | Field | Was | Now |
|---|---|---|---|
| BUG-COND-01 | `shutterWindowCount` (housing) | Always rendered | Only when `hasShutters === true` |
| BUG-COND-02 | `airConditioningDetails` + `airConditioningType` (thermal) | Always rendered | Only when `hasAirConditioning === true` |
| BUG-COND-03 | `solarPanelDetails` (additional) | Always rendered | Only when `hasSolarPanels === true` |

Note: Validation logic was already correct — only the JSX rendering was wrong.

---

### Cycle 5 — Conditional Visibility Verification (2026-04-02) ⏳

> Run by: **QA Agent** · **In progress — awaiting test run**

New tests being added by **Coding Agent** (TASK-CODING-1):
- `app/src/lib/energyCertificateValidation.test.ts` — 6 new unit tests (UNIT-COND-01 to 06)
- `tests/e2e/energy-certificate.spec.ts` — 3 new E2E tests (COND-01, COND-02, COND-03)

| Test ID | Suite | Description | Expected |
|---|---|---|---|
| UNIT-COND-01 | Unit | hasShutters=false → no shutterWindowCount error | ⏳ |
| UNIT-COND-02 | Unit | hasShutters=true + empty count → error | ⏳ |
| UNIT-COND-03 | Unit | hasAirConditioning=false → no AC field errors | ⏳ |
| UNIT-COND-04 | Unit | hasAirConditioning=true + empty fields → errors on both | ⏳ |
| UNIT-COND-05 | Unit | hasSolarPanels=false → no solarPanelDetails error | ⏳ |
| UNIT-COND-06 | Unit | hasSolarPanels=true + empty → error | ⏳ |
| COND-01 | E2E | Housing: shutterWindowCount hidden/shown by hasShutters toggle | ⏳ |
| COND-02 | E2E | Thermal: AC fields hidden/shown by hasAirConditioning toggle | ⏳ |
| COND-03 | E2E | Additional: solarPanelDetails hidden/shown by hasSolarPanels toggle | ⏳ |

---

## 🐛 Issues Found & Fixed

| Issue ID | Description | Found | Fixed | Files |
|---|---|---|---|---|
| BUG-T08-A | API path `/api/projects/` → `/api/project/` | Cycle 1 | Cycle 2 | `tests/e2e/form-diagnosis.spec.ts` |
| BUG-T08-B | Auth header `x-token` → `x-project-token` | Cycle 1 | Cycle 2 | `tests/e2e/form-diagnosis.spec.ts` |
| BUG-T08-C | Missing request timeout → added `timeout: 30000` | Cycle 1 | Cycle 2 | `tests/e2e/form-diagnosis.spec.ts` |
| BUG-REG-03 | Test expected HTTP 200 for not-found phone; backend correctly returns 404 | Cycle 3 | Cycle 4 | `tests/e2e/bug-regressions.spec.ts` |
| BUG-COND-01 | `shutterWindowCount` always visible — should only show when `hasShutters === true` | Code review | FIX-3 | `app/src/sections/EnergyCertificateSection.tsx` |
| BUG-COND-02 | `airConditioningDetails` + `airConditioningType` always visible — should only show when `hasAirConditioning === true` | Code review | FIX-3 | `app/src/sections/EnergyCertificateSection.tsx` |
| BUG-COND-03 | `solarPanelDetails` always visible — should only show when `hasSolarPanels === true` | Code review | FIX-3 | `app/src/sections/EnergyCertificateSection.tsx` |

---

## 📊 Coverage Gaps — Upcoming Tests (Prioritized)

> These map directly to PRD § QA and Regression Protection.

| Priority | Test ID | Description | Blocks AC |
|---|---|---|---|
| 🔴 High | E2E-FLOW-01 | Full EC happy path: all 3 steps + signature + submit | PRD: full completion path |
| 🔴 High | E2E-FLOW-02 | EC skip path: skip button → review section → submit | PRD: skip path |
| 🔴 High | E2E-FLOW-03 | EC resume path: in-progress EC → re-open → continues | PRD: resume path |
| 🟡 Med | E2E-FLOW-04 | EC follow-up path: property-docs → EC → review | PRD: follow-up path |
| 🟡 Med | DASH-01 | Dashboard: completed EC shows preview + "Ver PDF" | PRD: dashboard preview |
| 🟡 Med | DASH-02 | Dashboard: skipped EC shows "Saltado por cliente" badge | PRD: dashboard status |
| 🟡 Med | API-03 | GET `/api/project/:code/download-zip` returns ZIP | PRD: ZIP export |
| 🟢 Low | API-01 | POST `/api/project/:code/save` valid payload → 200 | General API |
| 🟢 Low | API-02 | POST `/api/project/:code/save` invalid token → 401 | General API |
| 🟢 Low | E2E-MOBILE-01 | Mobile viewport (375×667): form usable | UX |
| 🟢 Low | E2E-REGION-01 | Catalonia flow: representation doc renders | Regional |
| 🟢 Low | E2E-REGION-02 | Madrid flow: representation doc renders | Regional |

---

## 🧠 Agent Learnings (Indexed)

> Logged to `.codex/agent_learnings/entries/` per ai-coding-workflow.

| File | Insight |
|---|---|
| `2026-04-02-api-endpoint-naming.json` | Backend uses singular `/api/project/:code` not plural |
| `2026-04-02-auth-header-naming.json` | Auth header is `x-project-token` not `x-token` |
| `2026-04-02-qa-loop-orchestration.json` | Orchestrator → Coding Agent → QA Agent loop pattern |
| `2026-04-02-test-coverage-mapping.json` | Test IDs must map explicitly to PRD acceptance criteria |

---

## 📝 System Notes

- **Orchestration:** Orchestrator (this file) → Coding Agent → QA Agent (each with separate context, separate knowledge)
- **Dev servers:** Frontend `localhost:5000` (Vite) · Backend `localhost:3001` (Express)
- **Test projects:** ELT20250001 (solar, Catalonia) · ELT20250002 (aerothermal) · ELT20250003 (solar)
- **Dashboard password (dev):** `eltex2025` (from `backend/server.js` line 669)
- **Run unit tests:** `cd app && pnpm run test`
- **Run E2E tests:** `npx playwright test --reporter=list`
- **Screenshots:** `test-results/diagnosis-screenshots/`
- **Playwright report:** `playwright-report/index.html`
