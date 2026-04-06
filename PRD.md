# Product Requirements Document
## Eltex — Bug Fixes, Extraction Intelligence & UX Improvements

**Version**: 2.0
**Date**: 2026-04-06
**Status**: In Progress
**Author**: Agent (from user conversation)

---

## Overview

This PRD covers six distinct issues reported across the Eltex Document Collection Form. Each issue is described in full detail with its root cause, user story, acceptance criteria, and technical design. Issues are ordered by severity and logical implementation dependency.

---

## Issue 1 — Phone Lookup Fails in Same Browser After Project Deletion (Cookie / State Poisoning)

### Problem Description

When an assessor:
1. Creates a project for a customer phone number via the dashboard or form
2. **Deletes** the project from the admin dashboard (`DELETE /api/dashboard/project/:code`)
3. Opens the form **in the same browser** (not incognito)
4. Enters the same phone number again

…the lookup silently fails or returns an error even though the project no longer exists in the backend. The same flow works perfectly in an incognito window. This is a **stale local state / storage poisoning** problem — not an HTTP cookie issue (the app does not use cookies for the customer flow).

### Root Cause (Confirmed)

The customer flow uses two layers of client-side persistence:
- **localStorage**: key `eltex_form_backup_<code>` — stores a copy of `formData` (photos, extractions, etc.)
- **IndexedDB**: same data as backup
- **localStorage section key**: `eltex_section_<code>` — stores last active section

When a project is deleted from the dashboard, **none of these client-side stores are cleared**. On the next visit:

1. `PhoneSection` calls `GET /api/lookup/phone/:phone` → backend finds no project → returns `{ found: false }` or 404.
2. The frontend correctly shows the "Nuevo expediente" (new project) form.
3. Assessor fills it and calls `POST /api/project/create` → backend creates a new project with a **new code** (e.g. `ELT20260007`).
4. `handlePhoneConfirmed` in `App.tsx` receives the new project, sets it in state, and navigates to `/?code=ELT20260007`.
5. `App.tsx` then triggers `fetchProject('ELT20260007')`.
6. **The problem**: `App.tsx` reads `readLocalBackup('ELT20260007')` — which returns **null** (correct, no backup for new code). But `readIndexedDBBackup` is async and may also return null. This path is fine for a genuinely new code.

**However**, if the deleted project happened to share the same code (edge case: code re-use after deletion), or if there is stale section state, the app may route incorrectly.

**More likely scenario**: The assessor enters the phone, the lookup returns `{ found: false }`, but the `PhoneSection` state machine may not be resetting properly if there was a prior successful lookup in the same session. Specifically:
- `PhoneSection` tracks local state `showNewForm`, `error`, and `lookupResult`.
- If the user previously looked up a valid number in the same tab, the component may have stale state that bleeds over on the next attempt.
- Additionally, if the project was deleted but the **URL still has `?code=ELTxxxxxx`** from a prior session, `App.tsx` will attempt to `fetchProject` with the old code and get a 404 (`PROJECT_NOT_FOUND`), showing the error screen instead of the phone lookup screen.

**Third scenario** (most likely, confirmed by incognito test): The browser has a valid `?code=ELTxxxxxx` in the URL or localStorage from a previous session. The app loads that code, gets a 404 from the server (deleted project), shows the error screen. The assessor cannot get back to the phone form without clearing the URL manually.

### User Story

> As an assessor who deleted a project from the dashboard and tries to re-onboard the same customer in the same browser, I should be able to enter the phone number again and create a new project without hitting any errors or stale state from the previous session.

### Acceptance Criteria

- [ ] When `GET /api/lookup/phone/:phone` returns `{ found: false }` (project deleted or never existed), the phone form correctly shows the "Nuevo expediente" creation form.
- [ ] When a project code in the URL returns a 404 from the backend, the app clears the URL code parameter and redirects to the phone entry screen (not an error screen). The error screen is only shown for genuine system errors (500, NETWORK_ERROR, etc.), not for "project not found" on a previously-visited code.
- [ ] When a project is created and the assessor is redirected to the new code URL, any stale localStorage/IndexedDB backup keyed to the **old** code is not loaded.
- [ ] When a new project is created, if there is stale `eltex_section_<oldcode>` in localStorage, it does not interfere with the new project's routing.
- [ ] The phone form's "Continuar" button and input correctly reset between lookup attempts so a second lookup on the same number (after deletion) works without requiring a page refresh.
- [ ] Incognito and same-browser sessions produce identical outcomes for the same phone number after deletion.

### Technical Design

**File: `app/src/App.tsx`**

In the project loading `useEffect`, when `fetchProject` returns `{ success: false }` with a code indicating the project doesn't exist (e.g. `PROJECT_NOT_FOUND` or HTTP 404):

```typescript
// Instead of setting loadError to 'PROJECT_NOT_FOUND' and showing ErrorSection:
if (error === 'PROJECT_NOT_FOUND') {
  // Clear the URL code so the phone form shows
  navigate('/', { replace: true });
  // Clear any stale backup for this code
  clearLocalBackup(urlCode);
  return;
}
```

This means the app gracefully falls back to the phone screen when a code no longer exists, rather than showing a dead-end error page. The phone form will then let the assessor look up the phone again and create a fresh project.

**File: `app/src/sections/PhoneSection.tsx`**

Reset the `showNewForm`, `lookupResult`, `error`, and form field state when the lookup returns `found: false`, to ensure a clean state for each attempt. Currently the local state may not reset on a second call.

---

## Issue 2 — n8n Webhook Fires Both `new_order` and `doc_update` Simultaneously on Every Submit

### Problem Description

When a customer submits the form for the **first time**, the backend fires two webhook calls in rapid succession:
1. `new_order` — creates the record in Baserow (n8n side)
2. `doc_update` — updates which documents are present

This is **by design** for the very first submission. However, n8n is not handling the near-simultaneous arrival gracefully — it appears to process both as a "create + update" race, causing duplicate or conflicting rows in Baserow. Additionally, any **subsequent** submission (e.g., customer adds the electricity bill later) only sends `doc_update`, which is correct — but n8n may still be creating a second row if its deduplication logic is fragile.

### Root Cause (Confirmed)

In `backend/server.js` (lines 1015–1029), the submit handler:

```javascript
if (!project.docflowNewOrderSent) {
  project.docflowNewOrderSent = true;
  saveDB();
  await fireDocFlowNewOrder(project);   // awaited — guarantees row exists before doc_update
}
fireDocFlowDocUpdate(project.code, docsUploaded);  // always fires, fire-and-forget
```

The `new_order` is awaited with a 5-second timeout. The `doc_update` fires immediately after. The gap between them is typically **< 100ms** — not enough for n8n to finish inserting the Baserow row before the `doc_update` arrives.

The root of the race condition is on the **n8n side**: the n8n workflow that handles `new_order` needs to complete the Baserow insert before the `doc_update` workflow runs the update. If n8n processes them in parallel (separate webhook executions), the `doc_update` tries to find a row that hasn't been inserted yet.

**Backend-side fix**: Introduce a configurable delay between `new_order` and `doc_update` on first submission. Additionally, the `doc_update` on first submission is redundant — the `new_order` payload already contains `docs_required`. The first `doc_update` can simply be **skipped** when `new_order` was just sent for the first time in this submit call.

### User Story

> As an Eltex operations engineer, when a customer submits their form for the first time, I want n8n to receive a `new_order` call, create the Baserow record, and only then receive the `doc_update` call — never both simultaneously, and never with a race condition.

### Acceptance Criteria

- [ ] On a customer's **first ever submission**, only `new_order` fires (no simultaneous `doc_update`). The `doc_update` on first submission is suppressed because `new_order` already carries all required doc information.
- [ ] On **subsequent submissions** (customer returns to add more docs), only `doc_update` fires. `new_order` is never re-sent (existing guard `docflowNewOrderSent` remains in place).
- [ ] If `new_order` fails (network error, timeout), `doc_update` is NOT fired for that submission — the next submission retries `new_order` first.
- [ ] The `new_order` payload is enriched to include `docs_uploaded` (the same list that `doc_update` would have sent), so n8n has full information in a single call on first submission.
- [ ] A configurable minimum delay (default: 2 seconds) is added between `new_order` completion and `doc_update` on first submissions, as a fallback safety buffer. This delay is configurable via environment variable `DOCFLOW_DOC_UPDATE_DELAY_MS` (default `2000`).
- [ ] All webhook call outcomes are logged with `[DocFlow]` prefix at the server console for observability.

### Technical Design

**File: `backend/server.js`** — modify the submit handler's DocFlow block:

```javascript
// ── DocFlow webhook sequence ──────────────────────────────────────────────────
const docsUploaded = extractCompletedDocKeys(formData, project.assetFiles, existingFormData);
const isFirstSubmit = !project.docflowNewOrderSent;

if (isFirstSubmit) {
  project.docflowNewOrderSent = true;
  saveDB();
  const ok = await fireDocFlowNewOrder(project, docsUploaded); // pass docs list
  if (!ok) {
    // new_order failed — do not fire doc_update; will retry on next submit
    project.docflowNewOrderSent = false;
    saveDB();
  }
  // On first submit: doc_update is skipped (new_order payload already contains docs)
} else {
  fireDocFlowDocUpdate(project.code, docsUploaded);
}
```

**Modify `fireDocFlowNewOrder`** to accept `docsUploaded` and include it in the payload:

```javascript
async function fireDocFlowNewOrder(project, docsUploaded = []) {
  const payload = {
    type: 'new_order',
    order_id: project.code,
    customer_name: project.customerName || '',
    phone: project.phone,
    locale: project.customerLanguage || 'es',
    contract_date: project.createdAt,
    docs_required: project.docsRequired || [],
    docs_uploaded: docsUploaded,   // ← NEW: eliminates need for separate doc_update
  };
  // ... rest unchanged
}
```

---

## Issue 3 — Representation Document Preview: Arrow Button Should Be Swipeable on Mobile

### Problem Description

In the `RepresentationSection`, when a user previews the legal documents (IVA certificate, representation power, Generalitat declaration) before signing, navigation between documents uses a visible **arrow button** (next/previous). On mobile, users expect to be able to **swipe left/right** to navigate, as is standard mobile UX for carousels.

### Root Cause (Confirmed)

The carousel in `RepresentationSection.tsx` is a custom-built CSS scroll container using:
- `overflow-x-auto`
- `scroll-snap-type: x mandatory`
- `touchAction: 'pan-x'`
- `onScroll` handler to sync `activeDocIndex`

This means native touch scrolling **is already enabled** — the container does respond to swipe gestures. The issue is likely one of the following:
1. An overlaying element (e.g. a click handler or the document preview canvas) is **intercepting touch events** and preventing the scroll container from receiving them.
2. The `touchAction` style may be applied to a child rather than the scroll container itself, making swipe detection inconsistent.
3. The document image (rendered on a `<canvas>`) may be absorbing pointer events.

Additionally, the arrow button (next slide) is visible on mobile and is the only reliable navigation — reinforcing that swipe is not working despite the CSS scroll-snap setup.

### User Story

> As a customer reviewing legal documents before signing on my phone, I should be able to swipe left and right to navigate between the documents, just like any standard mobile image carousel. The arrow button should still be visible as an optional shortcut, but swipe should be the primary mobile interaction.

### Acceptance Criteria

- [ ] Swiping left on mobile navigates to the next document; swiping right navigates to the previous document.
- [ ] The `activeDocIndex` state correctly tracks the document shown after a swipe (pagination dots update).
- [ ] The canvas/image element inside each slide does NOT intercept touch events — swipe flows through to the scroll container.
- [ ] The arrow button (next) remains visible as an alternative navigation option.
- [ ] Swipe works on both iOS Safari and Android Chrome.
- [ ] The `onScroll` sync (updating `activeDocIndex`) continues to function after a swipe.
- [ ] No regression to the auto-tour or signature sync behaviour.

### Technical Design

**File: `app/src/sections/RepresentationSection.tsx`**

1. Ensure the scroll container `div` has `style={{ touchAction: 'pan-x' }}` directly on it (not on a child).
2. Add `style={{ pointerEvents: 'none' }}` to the `<canvas>` elements inside each slide so they don't absorb touch events.
3. Optionally add explicit `onTouchStart` / `onTouchEnd` handlers on the scroll container to nudge `scrollTo` if scroll-snap is not firing correctly on iOS.
4. Verify the `onScroll` handler fires correctly after a finger-initiated scroll (iOS defers `onScroll` until the deceleration ends — use `scrollend` event or a polling fallback if needed).

---

## Issue 4 — Document AI Extraction: Maximise Field Coverage Across All Document Types

### Problem Description

The app accepts five document types: **DNI (front + back)**, **IBI** (property tax receipt), **electricity bill (factura de luz)**, and **Eltex sales contract**. Currently, field resolution for downstream use (PDF overlays, representation forms, n8n payloads) is:

```
fullName:    contract → DNI front → EB titular → IBI titular
dniNumber:   contract → DNI front → EB nifTitular → IBI titularNif
address:     contract → EB direccionSuministro → DNI back → IBI direccion
municipality:contract → EB municipio → DNI back → IBI municipio
province:    contract → EB provincia → (no IBI fallback) ← GAP
postalCode:  contract → EB → IBI → representation manual
```

**Identified gaps**:

1. **`province`** has no IBI fallback — if there is no contract and no electricity bill, province is empty even when IBI has `provincia`.
2. **`firstName` and `lastName`** are only populated from DNI front — if no DNI is uploaded, these are null even when the full name is known from EB or IBI.
3. **`cups`** (electricity supply point identifier) is only stored in the electricity bill extraction but is not propagated to the representation form postal code pre-fill or the energy certificate data.
4. **`referenciaCatastral`** (cadastral reference from IBI) is extracted but only used in the Energy Certificate section — it is not cross-referenced with the representation/signing forms.
5. **IBI `titular`** naming is used in the customer name resolution but not as a fallback for `firstName`/`lastName` derivation when DNI is absent.
6. **Extraction quality of EB**: The electricity bill prompt does not currently ask for `tipoFase` (single-phase vs three-phase) to be pre-filled in the energy certificate — this field exists in the prompt response but is not wired to the EC form auto-fill.

### What "EB" and "IBI box" mean in this context

- **EB** = **Electricity Bill** (factura de luz / boletín eléctrico) — the monthly electricity invoice showing CUPS, contracted power, address, and titular.
- **IBI** = **Impuesto de Bienes Inmuebles** — the annual property tax receipt showing cadastral reference, owner name, and property address. In the app, this slot also accepts property deeds (*Escritura*).
- **Factura** = **Electricity bill** (same as EB in the user's terminology).

### User Story

> As an assessor uploading documents, if I only upload the electricity bill (no DNI, no IBI), the system should extract as many fields as possible from the bill alone — name, NIF, address, municipality, province, postal code, CUPS. If I then add the IBI, any remaining gaps (cadastral reference, province if missing from EB) should be filled automatically. The system should never leave a field empty if any uploaded document contains that data.

### Acceptance Criteria

**Field resolution completeness:**
- [ ] `province` fallback chain: `contract → EB.provincia → IBI.provincia → DNI back (not available) → null`.
- [ ] `firstName` / `lastName`: when DNI front is absent, attempt to derive from `fullName` (split on first space: first token = firstName, rest = lastName) using the best available source (contract → EB.titular → IBI.titular). Store derived values only if not overriding real DNI data.
- [ ] `cups` is stored in `formData.electricityBill.pages[0].extraction.extractedData.cups` and is surfaced in the Energy Certificate form's thermal/electrical step as a pre-filled read-only field (if present).
- [ ] `tipoFase` (single/three-phase) from EB extraction is pre-filled into the Energy Certificate section's relevant field automatically when the EC section is first opened.
- [ ] `referenciaCatastral` from IBI extraction continues to pre-fill the EC section (already implemented — verify it still works).
- [ ] `municipality` fallback: `contract → EB → DNI back → IBI → null` (IBI fallback added where missing).
- [ ] All field fallback chains are applied **both** in the backend (`resolveCustomerSnapshot`) and in the frontend PDF overlay builder so the two are in sync.

**Extraction prompt improvements:**
- [ ] The IBI prompt is updated to also attempt extracting `provincia` (province) — it is visible on most IBI receipts but currently not in the prompt output schema.
- [ ] The EB prompt's response schema is confirmed to include `tipoFase` — it already does; verify it is correctly parsed and stored.
- [ ] A new field `cups` is explicitly wired from EB extraction to the Energy Certificate's `additional.cups` or equivalent field in `EnergyCertificateData`.

**No-DNI flow:**
- [ ] If DNI front is not uploaded, the "Review & confirm" panel in `PropertyDocsSection` does not show DNI as a blocking error for fields that were successfully resolved from EB or IBI.
- [ ] The system still flags DNI as a **required document** (current validation rules unchanged) but does not block extraction-based field population.

### Technical Design

**File: `backend/server.js`** — `resolveCustomerSnapshot` function:

Add `ibi.provincia` to the province fallback:
```javascript
province: contract.province || eb.provincia || ibi.provincia || '',
```

Update IBI prompt to include `provincia` in the JSON schema:
```
{"isCorrectDocument":true,...,"extractedData":{..., "provincia":"string or null"}}
```

**File: `app/src/sections/EnergyCertificateSection.tsx`** — auto-fill on mount:

```typescript
// On mount, if tipoFase is known from EB and not yet set in EC data:
useEffect(() => {
  const tipoFase = electricityBill?.pages?.[0]?.extraction?.extractedData?.tipoFase;
  if (tipoFase && !data.thermal.tipoFase) {
    mutate(prev => ({ ...prev, thermal: { ...prev.thermal, tipoFase } }));
  }
}, []);
```

---

## Issue 5 — Continue Button Stuck After Re-uploading Electricity Bill (Factura)

### Problem Description

Scenario:
1. Customer opens the form without having uploaded an electricity bill.
2. Customer comes back (same or new session) and uploads the electricity bill on the `PropertyDocsSection`.
3. The AI extraction runs and completes (success or error).
4. The **blue "Continuar" button** remains disabled / unclickable even after extraction finishes.

The button works fine on the very first upload (new session). The issue only appears on **re-uploads** — when a page is added to an existing `electricityBill.pages` array that already had items.

### Root Cause (Confirmed)

The `ElectricityCard` component tracks pending items in its `pendingItems` local state array. `isBusy = pdfExpanding || pendingItems.some(p => p.status !== 'failed')`.

On re-upload:
1. A new item is added to `pendingItems` with `status: 'validating'`.
2. Extraction runs and sets `status: 'extracting'` then on success calls `onAddPages`.
3. `onAddPages` is called in the parent (`PropertyDocsSection`), updating `electricityBill.pages` state in `useFormState`.
4. **Bug**: After `onAddPages` is called successfully, the `pendingItems` state in `ElectricityCard` is **not cleared**. The new item remains in `pendingItems` with `status: 'extracting'` because the success path inside the card's async handler calls `onAddPages` but may not correctly transition the item to a cleared/removed state.
5. `isBusy` remains `true` forever → button stays disabled.

Additionally, there is a second possible failure mode: when the component **re-mounts** (e.g. the user navigated away and came back), `pendingItems` resets to `[]` correctly (it's local state), but `electricityIsBusy` in the parent may have been cached as `true` from the previous mount and not reset — though this is less likely.

The most reliable trigger is: upload → extraction succeeds → `onAddPages` fires → item is NOT removed from `pendingItems`.

### User Story

> As a customer who comes back to the form to add their electricity bill after initially skipping it, I should be able to upload the bill, see the extraction complete, and then click the blue "Continuar" button to proceed — without it being permanently disabled.

### Acceptance Criteria

- [ ] After `onAddPages` is called successfully, the corresponding item is removed from `pendingItems` (or set to a terminal state that does not keep `isBusy` true).
- [ ] After a successful extraction and `onAddPages` call, `electricityIsBusy` in `PropertyDocsSection` returns to `false`.
- [ ] The "Continuar" button becomes enabled within 200ms of a successful extraction completion.
- [ ] Re-uploading on top of an existing page (replacing) also correctly clears busy state.
- [ ] If extraction fails (e.g. wrong document type), the item is correctly set to `status: 'failed'` and `isBusy` returns to `false` — the button becomes enabled so the user can try again.
- [ ] No regression for first-time uploads (they already work).

### Technical Design

**File: `app/src/sections/PropertyDocsSection.tsx`** — `ElectricityCard` component:

In the async upload handler, after `onAddPages` is successfully called, remove the processed item from `pendingItems`:

```typescript
// After onAddPages(...) succeeds:
setPendingItems(prev => prev.filter(p => p.id !== item.id));
```

Currently, the success path likely does:
```typescript
onAddPages(extractedPages, extraction, originalPdfs);
// ← item is NOT removed from pendingItems here
```

Fix: add the filter call immediately after `onAddPages` in the success branch.

Also add a safety timeout: if any item remains in `pendingItems` with `status: 'extracting'` for more than 30 seconds, forcibly set it to `status: 'failed'` with `error: 'Tiempo de espera agotado'`. This prevents permanent stuck state from network hangs.

---

## Issue 6 — Energy Certificate: "Material Radiadores" Always Visible Despite Being Conditional

### Problem Description

In the Energy Certificate section's **Thermal step (Step 3)**, the field order is:

1. **Tipo de Calefacción** — options: "Radiadores de Agua", "Radiadores eléctricos", "Suelo Radiante"
2. **Material Radiadores** — options: "Hierro fundido", "Aluminio"

The **Material Radiadores** field should only be visible when "Tipo de Calefacción" is set to "Radiadores de Agua" or "Radiadores eléctricos". It is **not applicable** when "Suelo Radiante" is selected (since there are no radiators with floor heating).

### Current Behaviour (Broken)

The current code has:
```typescript
{data.thermal.heatingEmitterType !== 'suelo-radiante' && (
  <SegmentedOptions label="Material Radiadores" ... />
)}
```

This correctly hides the field when "Suelo Radiante" is selected. **However**, the initial value of `heatingEmitterType` is likely `null` or an empty string (not set yet) — which means `!== 'suelo-radiante'` evaluates to `true` and the "Material Radiadores" field is **always shown on initial render**, before the user has selected any heating type.

Additionally, the field is visible when no heating is selected at all — which is confusing because "Material Radiadores" only makes sense after a radiator type is confirmed.

### User Story

> As an assessor filling in the energy certificate, I should only see the "Material Radiadores" field after I have selected "Radiadores de Agua" or "Radiadores eléctricos" as the heating type. Before any selection is made, or if "Suelo Radiante" is selected, the field should not be visible.

### Acceptance Criteria

- [ ] "Material Radiadores" is **hidden** when `heatingEmitterType` is `null`, `undefined`, or empty string (no selection made yet).
- [ ] "Material Radiadores" is **hidden** when `heatingEmitterType === 'suelo-radiante'`.
- [ ] "Material Radiadores" is **visible** when `heatingEmitterType === 'radiadores-agua'` or `heatingEmitterType === 'radiadores-electricos'`.
- [ ] When the user switches from a radiator type to "Suelo Radiante", the `radiatorMaterial` value is automatically reset to `'no-aplica'` (already implemented — verify this still works).
- [ ] When the user switches back from "Suelo Radiante" to a radiator type, `radiatorMaterial` resets to `null` / unset so they must re-select.
- [ ] Validation correctly flags `radiatorMaterial` as required only when a radiator-type heating is selected.
- [ ] No visual "jump" or layout shift when switching between heating types.

### Technical Design

**File: `app/src/sections/EnergyCertificateSection.tsx`**

Change the conditional from:
```typescript
{data.thermal.heatingEmitterType !== 'suelo-radiante' && (
```
To:
```typescript
{(data.thermal.heatingEmitterType === 'radiadores-agua' || data.thermal.heatingEmitterType === 'radiadores-electricos') && (
```

Also update the validation logic (wherever `thermalRadiatorMaterial` is validated as required) to only require it when the heating type is one of the radiator options.

---

## Implementation Order

| # | Issue | Risk | Effort | Priority | Rationale |
|---|-------|------|--------|----------|-----------|
| 1 | Radiador conditional (Issue 6) | Very Low | XS (1 line) | Critical | Quickest fix, visible regression |
| 2 | Continue button stuck (Issue 5) | Low | Small | High | Blocks customer form completion |
| 3 | Phone / stale state bug (Issue 1) | Medium | Small | High | Prevents re-onboarding after deletion |
| 4 | n8n double-fire (Issue 2) | Low | Small | High | Causes operational data errors |
| 5 | Swipe on carousel (Issue 3) | Low | Medium | Medium | UX improvement, not a blocker |
| 6 | Extraction intelligence (Issue 4) | Medium | Medium | Medium | Data quality improvement |

---

## Out of Scope

- Changes to the PDF signature overlay coordinates.
- Admin dashboard UI redesign.
- n8n workflow internal logic changes (only the backend webhook payload/timing is in scope).
- New document types beyond the five already supported.
- Changing the document upload order or making any document truly optional from a validation standpoint.

---

## Open Questions

- Q: For Issue 4 (extraction intelligence) — should `tipoFase` from the electricity bill auto-fill the energy certificate field, or only be shown as a suggestion that the assessor can accept?
  - **Decision needed from user.**
- Q: For Issue 2 (n8n) — should we add a configurable delay (e.g. 2s) between `new_order` and `doc_update`, or should we simply skip the `doc_update` on first submission entirely (since `new_order` will now carry `docs_uploaded`)?
  - **Recommendation**: skip `doc_update` on first submit. Confirm with user.
- Q: For Issue 3 (swipe) — should the arrow button be removed on mobile once swipe works, or kept as an additional control?
  - **Decision needed from user.**

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-04-04 | 1.0 | Initial PRD — section persistence, signature UX, carousel crop |
| 2026-04-06 | 2.0 | Full rewrite: 6 new issues from user — phone/state bug, n8n double-fire, swipe carousel, extraction intelligence, continue button stuck, radiator conditional |
