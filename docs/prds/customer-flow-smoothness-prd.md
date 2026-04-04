# PRD: Customer Flow Smoothness (Pareto 20%)

**Created:** 2026-04-03  
**Completed:** 2026-04-03  
**Owner:** Eltex Engineering  
**Goal:** Fix the 20% of issues causing 80% of customer friction in the document collection flow.

---

## Background

After a full first-principles audit of the customer flow using Design + UI/UX review, 5 issues were identified as the highest-leverage fixes for frictionless customer experience.

---

## Issues & Status

| # | Issue | Priority | Status | Test |
|---|-------|----------|--------|------|
| 1 | No global progress indicator across 6-step flow | HIGH | ✅ DONE | ✅ PASS |
| 2 | Back button takes customers to phone/assessor screen | HIGH | ✅ DONE | ✅ PASS |
| 3 | SuccessSection crashes if `customerName` is missing | CRITICAL | ✅ DONE | ✅ PASS |
| 4 | IBI shows "not done" on review even when uploaded via pages | HIGH | ✅ DONE | ✅ PASS |
| 5 | Loading screen spins forever with no timeout or recovery | HIGH | ✅ DONE | ✅ PASS |

---

## What Was Built

### Issue 1 — FlowProgressBar (NEW component)
**File:** `app/src/components/FlowProgressBar.tsx`  
A fixed top bar showing 5 steps (Documentos → Ubicación → Autorización → Certificado → Revisión) with a progress indicator and "X / 5" counter. Uses `backdrop-blur` + `bg-white/95` for clean layering over content. Hidden on phone and success screens.

Integrated in `app/src/App.tsx`:
- `showProgressBar` condition requires: activeProject exists, not loading/error, not phone/success
- `<main className={showProgressBar ? 'pt-11' : ''}>` pushes content below the fixed bar

---

### Issue 2 — Back button conditional on source
**Files:** `app/src/App.tsx`, `app/src/sections/PropertyDocsSection.tsx`  

- `onBack` prop made optional (`onBack?: () => void`) in PropertyDocsSection
- Back button wrapped in `{onBack && (...)}` — only renders when prop is provided
- In App.tsx: `onBack={source === 'assessor' ? () => goTo('phone') : undefined}`
- Customers arriving via URL link (source='customer') never see the back button on step 1
- Assessors using phone flow (source='assessor') see it normally

---

### Issue 3 — SuccessSection null guard
**File:** `app/src/sections/SuccessSection.tsx`

- `const firstName = project.customerName?.split(' ')[0] || null;`
- Heading: `{firstName ? \`¡Todo listo, ${firstName}!\` : '¡Todo listo!'}`
- Handles: undefined, empty string, normal name — no crashes

---

### Issue 4 — IBI done check fixed in ReviewSection
**File:** `app/src/sections/ReviewSection.tsx`

- Before: `done: !!ibi.photo`
- After: `done: !!ibi.photo || (ibi.pages?.length ?? 0) > 0`
- Now matches the routing logic in `hasPropertyDocsDone()` in App.tsx

---

### Issue 5 — Loading timeout (12 seconds)
**File:** `app/src/App.tsx`

- `setTimeout` of 12,000ms fires `setLoadError('NETWORK_ERROR')` + `setLoadError` if fetch hasn't completed
- `clearTimeout(timeoutId)` in `.finally()` block cancels it when fetch completes (success or failure)
- Cleanup `return () => { controller.abort(); clearTimeout(timeoutId); }` as double-safety
- Bug caught by test subagent: initial implementation missed the `.finally()` clear — fixed immediately
- 'NETWORK_ERROR' → "Sin conexión" with retry + call Eltex buttons in ErrorSection

---

## Out of Scope (intentional decisions)
- Auto-submit after energy cert: intentional frictionless design — NOT a bug
- Emoji icons, file length, token in URL, assessor validation: deferred low-impact items
