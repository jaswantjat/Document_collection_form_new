# PRD: Customer Flow Smoothness (Pareto 20%)

**Created:** 2026-04-03  
**Owner:** Eltex Engineering  
**Goal:** Fix the 20% of issues causing 80% of customer friction in the document collection flow.

---

## Background

After a full first-principles audit of the customer flow using Design + UI/UX review, 5 issues were identified as the highest-leverage fixes for frictionless customer experience.

---

## Issues & Status

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | No global progress indicator across 6-step flow | HIGH | ⏳ TODO |
| 2 | Back button takes customers to phone/assessor screen | HIGH | ⏳ TODO |
| 3 | SuccessSection crashes if `customerName` is missing | CRITICAL | ⏳ TODO |
| 4 | IBI shows "not done" on review even when uploaded via pages | HIGH | ⏳ TODO |
| 5 | Loading screen spins forever with no timeout or recovery | HIGH | ⏳ TODO |

---

## Issue Details

### Issue 1 — No global progress indicator
**File:** New component + all section files  
**Problem:** 6-step flow (Property Docs → Province → Representation → Energy Cert → Review → Success) has zero overall progress visibility. Customers feel lost on mobile.  
**Fix:** Add a step progress bar at the top of each section (excluding phone and success).  
**Done when:** Customer can see "Step X of Y" or equivalent at every stage of the flow.

---

### Issue 2 — Back button takes customers to phone screen
**File:** `app/src/App.tsx`  
**Problem:** Customers arrive via `?code=XXX` URL. The back button in `property-docs` calls `onBack={() => goTo('phone')}` which shows the internal assessor phone-lookup screen.  
**Fix:** When the user arrived via URL (not phone flow), hide or disable the back button on the first screen.  
**Done when:** Customers who arrive via link never land on the phone screen.

---

### Issue 3 — SuccessSection crashes on missing customerName
**File:** `app/src/sections/SuccessSection.tsx`  
**Problem:** `project.customerName.split(' ')[0]` throws if `customerName` is empty or undefined.  
**Fix:** Add null guard — fall back to a generic greeting like "todo listo".  
**Done when:** SuccessSection renders correctly even when customerName is absent.

---

### Issue 4 — IBI "done" check inconsistency in ReviewSection
**File:** `app/src/sections/ReviewSection.tsx`  
**Problem:** ReviewSection checks `!!ibi.photo` for IBI done state, but multi-page IBI is stored in `ibi.pages`. Customers who uploaded IBI correctly see a false "not done" warning.  
**Fix:** Change check to `!!ibi.photo || (ibi.pages?.length ?? 0) > 0` matching the routing logic.  
**Done when:** Uploaded IBI (via pages) is correctly shown as done on the review screen.

---

### Issue 5 — Loading screen spins forever
**File:** `app/src/sections/LoadingSection.tsx` + `app/src/App.tsx`  
**Problem:** If the server is slow or the connection drops on initial load, the spinner runs indefinitely with no recovery path.  
**Fix:** Add a 12-second timeout in the fetch logic. If exceeded, show an error with a retry button instead of spinning.  
**Done when:** A network failure on load shows a user-actionable recovery screen within 15 seconds.

---

## Test Plan

Each fix tested by a dedicated subagent after implementation:

- **T1:** Progress bar renders on each step, hides on phone/success
- **T2:** Back button not visible/functional when customer arrives via URL code
- **T3:** SuccessSection renders without crash when customerName = "" or undefined
- **T4:** Review section shows IBI as done when `ibi.pages` has entries
- **T5:** Loading timeout triggers correctly after server delay

---

## Out of Scope (intentional decisions)
- Auto-submit after energy cert: this is intentional frictionless design — NOT a bug
- Emoji icons, file length, token in URL, assessor validation: deferred
