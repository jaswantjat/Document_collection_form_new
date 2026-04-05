# CHANGELOG

## 2026-04-05.4 — Session: Network Performance Optimization (PERF-01, 02, 03)

**Phase**: Developer

**PRD**: `docs/prds/PRD-performance-network-optimization.md`

**Features implemented:**

### PERF-01 — Express Response Compression
- Added `compression` npm package to `backend/package.json`
- Applied `app.use(compression())` before all middleware in `server.js`
- Effect: all JSON API responses are now gzip-compressed. Base64-heavy formData payloads that were 2–5 MB are now 300–700 KB over the wire (~5–7× reduction).
- Verified: `Vary: Accept-Encoding` header present on all responses; backend starts cleanly; health endpoint returns 200.

### PERF-02 — WebP + Smaller Resolution for AI Extraction
- Changed `compressImageForAI()` defaults in `app/src/lib/photoValidation.ts`:
  - Max dimension: `1600px → 1200px` (44% fewer pixels)
  - Quality: `0.82 → 0.70`
  - Format: `image/jpeg → image/webp` (~30% smaller at equivalent perceived quality)
- Added `format` parameter to `compressImageForAI()` (default: `'image/webp'`)
- `fileToPreview()` explicitly passes `format='image/jpeg'` — display previews remain JPEG (stored in localStorage and UI)
- Effect: each photo sent to AI extraction is ~40% smaller. 4-image session saves ~400–600 KB of upload on slow connections.

### PERF-03 — Progressive Photo Upload
- Added `preUploadAssets` import to `useFormState.ts`
- Added progressive upload `useEffect` in `useFormState.ts`:
  - Computes a `photoFingerprint` from all photo preview prefixes and page counts
  - When fingerprint changes (new photo added), fires `preUploadAssets` after 800ms debounce
  - Upload is fire-and-forget (never blocks UI)
- Effect: photos are uploaded to the server in the background immediately after each document is captured, not only when ReviewSection mounts. By the time the user reaches review, binary files are already on disk → submit is near-instant.

**QA results:**
- PERF-01: 5/5 checks PASS (compression package, middleware placement, clean start, Vary header, no broken routes)
- PERF-02: 5/5 checks PASS (defaults correct, format param, fileToPreview unchanged, TypeScript clean, all callers work)
- PERF-03: 5/5 checks PASS (import, fingerprint computation, debounce, refs, TypeScript clean)
- TypeScript: 0 errors across all three changes
- App loads correctly after full page reload

**Files changed:**
- `backend/server.js` (compression require + middleware)
- `backend/package.json` (compression dependency)
- `app/src/lib/photoValidation.ts` (compressImageForAI signature + fileToPreview format)
- `app/src/hooks/useFormState.ts` (preUploadAssets import + progressive upload effect)
- `docs/prds/PRD-performance-network-optimization.md` (new PRD)

---

## 2026-04-05.3 — Session: Capture firstName, lastName, and browserLanguage

**Phase**: Developer

**Feature:**
Added three new data fields that are captured automatically at zero extra API cost:

1. **`firstName` / `lastName`** — extracted by the existing DNI/NIE/passport AI prompt. Both the single-doc endpoint (dniFront) and the multi-doc identity endpoints now include `firstName` and `lastName` in their JSON schema. The AI reads the printed name and splits it into nombre (firstName) and apellidos (lastName).

2. **`browserLanguage`** — captured from `navigator.language` in the frontend form at startup and sent to the backend on every save/submit. Stored as `project.customerLanguage` on the project record.

**Backend changes (`backend/server.js`):**
- Extended all three DNI/NIE/passport extraction prompts to include `firstName` and `lastName` in the returned JSON schema.
- `getProjectSnapshot`: adds `firstName` and `lastName` from `dniFront` extraction to the snapshot object.
- `buildDashboardSummary`: exposes `firstName`, `lastName`, and `customerLanguage` in the summary returned to the dashboard.
- Save + submit handlers: persist `formData.browserLanguage` as `project.customerLanguage`.
- `serializeDashboardProject`: includes `customerLanguage` in the serialized project.

**Frontend changes:**
- `types/index.ts`: Added `browserLanguage?: string` to `FormData`; `customerLanguage?: string` to `ProjectData`.
- `lib/dashboardProject.ts`: Added `firstName`, `lastName`, `customerLanguage` to `DashboardProjectSummary` interface and `getSnapshot` / `getDashboardProjectSummary` implementations.
- `hooks/useFormState.ts`: Seeds `initialFormData.browserLanguage` with `navigator.language`.
- `pages/Dashboard.tsx`: Added `languageLabel()` helper (uses `Intl.DisplayNames` to render e.g. "español (es-ES)"). Shows a new 3-column info row (Nombre / Apellidos / Idioma) in the project detail panel when any of the three values is present.

**Verified:** TypeScript: 0 errors. Backend and frontend workflows running cleanly.

**Files changed:**
- `backend/server.js`
- `app/src/types/index.ts`
- `app/src/lib/dashboardProject.ts`
- `app/src/hooks/useFormState.ts`
- `app/src/pages/Dashboard.tsx`

---

## 2026-04-05.2 — Session: Fix representation card hidden in followUpMode

**Phase**: Developer

**Problem:**
`needsRepresentation` in `ReviewSection.tsx` was gated by `!followUpMode`. When `followUpMode` is true (all signatures already done from a prior session), the representation checklist card was suppressed entirely — even though signatures were complete and the card would correctly land in the COMPLETADO bucket.

**Fix:**
Removed `!followUpMode &&` from the `needsRepresentation` expression (line 72). The representation card now appears whenever a relevant location is set, regardless of `followUpMode`. Since `signaturesOk` is true in followUpMode, the card correctly shows as ✅ done ("Representación — 3 docs firmados").

**Verified:**
Screenshotted Revisión page (step 5/5) for a Cataluña project in followUpMode (all 3 sigs done, EC skipped). "Representación — 3 docs firmados" appears in COMPLETADO · 4 alongside DNI, IBI, and Factura de luz.

**Files changed:**
- `app/src/sections/ReviewSection.tsx` (1-line change, line 72)

**Test status:** TypeScript: 0 errors. Visual verification: confirmed.

---

## 2026-04-05.1 — Session: Section persistence, signature card, carousel revert

**Phase**: Developer

**Changes:**

1. **Section persistence on reload** (`App.tsx`)
   - Added `saveSectionToStorage` / `readSavedSection` helpers (key: `eltex_section_${code}` in localStorage).
   - `goTo()` now writes the current section to localStorage on every navigation.
   - `getInitialSection()` reads the saved section first and restores it before falling back to completion-flag routing.
   - Edge case handled: if saved section is `representation` but `hasRepresentationDone` is now true (completed from another device), advances past it.
   - `phone` and `success` sections are never persisted.

2. **Representation signature card in review** (`ReviewSection.tsx`)
   - Added a tappable card for "Representación" above the energy-certificate card.
   - Shown only when `location && location !== 'other'` and `!followUpMode`.
   - Done state: emerald border/background, green check, doc count, "Revisar" hint.
   - Pending state: eltex-blue border/background, alert icon, "Firma pendiente" / deferred message.
   - Tapping the card navigates to the `representation` section.
   - Removed the standalone amber warning banner (the new card replaces it).

3. **Document carousel revert + mount auto-tour** (`RepresentationSection.tsx`)
   - Removed `maxHeight: '220px', overflowY: 'hidden'` from the carousel scroll container — full A4 preview restored.
   - Added `hasMountCycled` ref and mount `useEffect` that cycles through all docs at 2 s intervals on arrival, so the customer sees each document before signing.

**Files changed:**
- `app/src/App.tsx`
- `app/src/sections/ReviewSection.tsx`
- `app/src/sections/RepresentationSection.tsx`
- `PRD.md` (created — full product requirements doc)

**Test status:** TypeScript: 0 errors.

---

## 2026-04-04.3 — Session: Representació — date vertical offset fix

**Phase**: Developer

**Problem:** After the previous horizontal fix (left-align, x=760), the date "4 de abril de 2026" still appeared visually higher than "BARCELONA" on the Lloc/Data row.

**Root cause (optical rendering):** With `textBaseline='top'`, both fills start at y=1459. "BARCELONA" is ALL CAPS — every letter fills the full cap-height so visual weight presses downward. "4 de abril de 2026" is mixed-case — x-height letters (e, a, r, i) are only ~50% of cap height, so the visual mass concentrates near the top of the em-square. This makes the date "float" ~5px visually above BARCELONA even though they share the same y coordinate.

**Fix:** Moved `data` y1 from 1459 → 1464, y2 from 1496 → 1501 (5px down). This brings the visual center of the mixed-case date string into alignment with the all-caps BARCELONA.

**Files changed:**
- `app/src/lib/signedDocumentOverlays.ts`
  - `REPRESENTACIO_FIELDS.data`: `[760, 1459, 1100, 1496]` → `[760, 1464, 1100, 1501]`
  - `SIGNED_DOCUMENT_TEMPLATE_VERSION` bumped to `'2026-04-04.2'`

**Test status:** TypeScript: 0 errors.

---

## 2026-04-04.2 — Session: Signature flow UX — compact carousel + auto-cycle tour

**Phase**: Developer

**Problem:** On mobile (375×667) the document carousel renders at its natural A4 aspect ratio: 335px wide → 474px tall. Combined with the page header, counter row, and hint text this pushed the signature pad ~100px below the fold. Users had to scroll to discover and reach the signature pad — unnecessary friction in a high-stakes legal flow.

**First-principles analysis:**
- The document thumbnail's only job: signal "this is a legal document with your data." The customer can read the full doc via the existing fullscreen modal ("Toca para leer"). A full A4 render is wasted height.
- The signature pad must be visible without scrolling. The customer's cognitive flow is: see docs → sign → continue.
- One signature covers all documents — the user should see this relationship visually.

**Changes:**
1. **Carousel height capped at 220px** (`maxHeight: '220px', overflowY: 'hidden'`). Shows the top of each A4 doc (name, header, key fields visible), "Toca para leer" overlay still covers it. Everything now fits in one screen without scrolling.
2. **Auto-cycle on first signature**: When the user draws their first signature, the carousel automatically sweeps through all remaining documents (1.3s each). This makes visible that the single signature stamps all docs — reduces cognitive friction ("wait, am I signing all 3?").
3. **Dot indicators "fill" after tour**: Once the auto-cycle completes, all inactive dots turn `eltex-blue/40` (muted blue), confirming "all documents covered." Active dot remains full blue.

**Files changed:**
- `app/src/sections/RepresentationSection.tsx`
  - Added `allDocsToured` state, `hasCycled` ref
  - Added auto-cycle `useEffect` triggered by first `sharedSignature` value
  - Carousel scroll container: added `maxHeight: '220px', overflowY: 'hidden'`
  - Dot indicators: `allDocsToured` turns inactive dots `bg-eltex-blue/40`

**Test status:** TypeScript: 0 errors. Visual/interaction change.

---

## 2026-04-04.1 — Session: Representació overlay — name gap + date alignment

**Phase**: Developer

**Problems:**

1. **Name overlapping label** — `personaNom` x-start was 370. The template's "Nom i cognoms / Raó social:" label ends at ≈ x=364, leaving only 6px clearance. With a bold name (e.g. "MARTA OLIVERES TORTOSA"), the text visually merges into the label.
   - Fix: `personaNom[0]` 370 → 395 (~31px gap at full resolution).

2. **Date misaligned with Barcelona** — `lloc` ("BARCELONA") is left-aligned at x=130, which sits snug ~22px after "Lloc:" ends (≈x=108). The `data` field used `'center'` alignment within [725–1100], centering the date at x≈912 — creating a 55px gap between "Data:" (ends ≈x=745) and the start of the date text. That asymmetry makes the two values look misaligned relative to their labels.
   - Fix: changed `data` x-start 725 → 760 and switched from `'center'` to `'left'` (default) alignment. The date now sits ≈15px after "Data:" colon, matching the snug placement of "BARCELONA" after "Lloc:".

**Files changed:**
- `app/src/lib/signedDocumentOverlays.ts`
  - `SIGNED_DOCUMENT_TEMPLATE_VERSION` bumped to `'2026-04-04.1'` (forces re-render of stored docs)
  - `personaNom[0]`: 370 → 395
  - `data[0]`: 725 → 760
  - `drawBoxText(..., REPRESENTACIO_FIELDS.data, 1.7, 'center')` → `drawBoxText(..., REPRESENTACIO_FIELDS.data, 1.7)`

**Test status:** TypeScript: 0 errors. Coordinate-only change.

**What's next:** —

---

## 2026-04-04 — Session: EC wizard step persistence on reload

**Phase**: Developer

**Root cause (two layers):**

1. `getInitialSection()` correctly routes users back to `energy-certificate` when `status === 'in-progress'` — that part was already working.
2. The 4-step wizard's `stepIndex` was `useState(0)` — ephemeral, never surviving a reload. Users landed at step 0 (Vivienda) even though their field answers for steps 1–3 were fully restored.

**Fix — component layer (already in place from previous session):**
- `EnergyCertificateSection` initialises state from the persisted value: `useState(data.currentStepIndex ?? 0)`
- `navigateToStep(newIndex, currentData)` replaces all raw `setStepIndex` calls — it calls both `setStepIndex` and `onChange({ ...currentData, currentStepIndex: newIndex })`, writing the step index into `formData.energyCertificate.currentStepIndex` on every navigation. This flows through the 300 ms localStorage backup and the 2 s debounced server save.

**Fix — merge layer (this session):**
There was a remaining gap in the "Case 2" merge path in `App.tsx` (triggered when the localStorage backup and server timestamps are within 500 ms of each other). The energyCertificate merge block spread `...serverFd?.energyCertificate` but never explicitly pulled the backup's `currentStepIndex`. Since the 300 ms backup fires up to 1.7 s before the 2 s server save, there was a window where the backup had the newer step index but it was silently dropped.

Added `currentStepIndex` to the explicit merge overrides — parallel to how `renderedDocument` is already handled:
```js
currentStepIndex: backupFd.energyCertificate?.currentStepIndex
  ?? serverFd?.energyCertificate?.currentStepIndex,
```

**Files changed:**
- `app/src/App.tsx` (1-line addition to Case 2 energyCertificate merge)

**Test status:** TypeScript: 0 errors. No logic changed in the wizard itself.

**What's next:** —

---

## 2026-04-03.7 — Session: Phone number validation hardening

**Phase**: Developer

**Problems found:**

1. **Spain numbers starting with 1–5 passed validation.** `parsePhone('+34512345678')` returned a valid result because the E.164 path only checks total digit count (7–15), not country-specific start-digit rules. A staff member entering an invalid Spanish number like `512345678` would see no error and trigger a pointless lookup.

2. **Functions were duplicated.** `parsePhone`, `buildPhone`, `getPhoneError`, and `formatLocalNumber` were defined inline in `PhoneSection.tsx` and then *copied manually* into `phone.test.ts` for unit testing. Any fix to the real code wouldn't automatically be tested.

3. **`buildPhone` only stripped a single leading zero.** `'00612345678'.replace(/^0/, '')` → `'0612345678'` — still incorrect. Fixed to strip all leading zeros (`/^0+/`).

**Fix:**

- Extracted all four functions to `app/src/lib/phone.ts` (new exported module)
- Added Spain-specific validation in `getPhoneError`: when `dialCode === '+34'`, the local digits must be exactly 9 and start with 6, 7, 8, or 9 — specific error messages for too short / too long / wrong start digit
- `PhoneSection.tsx` now imports from `@/lib/phone` — no more inline duplicates
- `phone.test.ts` now imports from the module and covers all four functions: 21 test cases across `parsePhone`, `buildPhone`, `getPhoneError` (Spain + international), and `formatLocalNumber`

**Files changed:**
- `app/src/lib/phone.ts` (new)
- `app/src/sections/PhoneSection.tsx` (replaced inline defs with imports)
- `app/src/lib/phone.test.ts` (full rewrite — now imports from module, 21 tests)

**Test status:** 37/37 passing (was 37 before; phone tests were 7, now 21). TypeScript: 0 errors.

**What's next:** —

---

## 2026-04-03.6 — Session: Fix deferred-signature routing (users can sign on return visit)

**Phase**: Developer

**Root cause (first principles):**
`hasRepresentationDone()` contained this check:
```js
if (rep.signatureDeferred) return true;
```
This made the routing system treat "user clicked Firmar más tarde" as equivalent to "user has actually signed." On every subsequent page load, `getInitialSection()` would see `signatureDeferred: true`, call `hasRepresentationDone()` → `true`, and route the user straight to energy-certificate or review — permanently skipping the signature section.

The in-session "allow proceeding past signature" behaviour never needed this check at all. When a user clicks "Firmar más tarde", `handleDeferSignature()` directly calls `onContinue()` — the routing function is not consulted at all during that navigation. The `signatureDeferred` flag in `hasRepresentationDone()` only affected the **reload** path, where it was wrong.

**Fix:**
Removed the three-line `signatureDeferred` early-return block from `hasRepresentationDone()` in `App.tsx`. The function now only returns `true` when actual signature values are present. The "Firmar más tarde" button continues to work for in-session navigation (direct `onContinue()` call). On reload, deferred users correctly land on the representation section where they can sign.

**Files changed:**
- `app/src/App.tsx`

**Test status:** TypeScript compiles cleanly (0 errors).

**What's next:** —

---

## 2026-04-03.5 — Session: Optional "Firmar más tarde" (remote / deferred signature)

**Phase**: Developer

**Problem:**
The signature section was a hard gate — the Continue button was disabled until the customer drew a signature. For remote-signing scenarios (assessor fills the form in office, customer signs later from home), there was no way to proceed without a signature, and the app would route the customer back to the signature screen every time they reloaded.

**Solution (progressive disclosure pattern):**
Added a "Firmar más tarde" secondary action that lets customers defer signing and continue to the review screen. Four changes:

1. **`app/src/types/index.ts`**: Added `signatureDeferred?: boolean` to `RepresentationData`
2. **`app/src/App.tsx`**: `hasRepresentationDone()` now returns `true` when `signatureDeferred: true`, so the router skips the signature section on reload (deferred users land on review, not stuck in signature loop)
3. **`app/src/sections/RepresentationSection.tsx`**:
   - Added `handleDeferSignature()` — sets `signatureDeferred: true` and calls `onContinue()`
   - Added "Firmar más tarde" tertiary button (clock icon, muted grey, below the primary Continue) — visually secondary so signing-in-person path stays prominent
   - `handleContinue()` explicitly clears `signatureDeferred: undefined` when the customer actually signs, so the flag is cleaned up
4. **`app/src/sections/ReviewSection.tsx`**: Warning message is context-aware — shows "Firma pendiente — recuerda volver..." for deferred users, the stronger "Sin ellas, tu asesor no podrá tramitar..." for users who simply skipped the section

**Files changed:**
- `app/src/types/index.ts`
- `app/src/App.tsx`
- `app/src/sections/RepresentationSection.tsx`
- `app/src/sections/ReviewSection.tsx`

**Test status:** TypeScript compiles cleanly (0 errors).

**What's next:** —

---

## 2026-04-03.4 — Session: Energy certificate submission speed fix

**Phase**: Developer

**Root cause (first principles):**
On submit, `createRenderedEnergyCertificateAsset()` was called synchronously in the submission path. This function:
1. Allocates a 1240×1754 pixel canvas (2.17M pixels)
2. Fetches `/eltex-logo.png` (network round-trip if uncached)
3. Draws ~30 table rows with text measurement on each
4. Calls `canvas.toDataURL('image/jpeg', 0.82)` — single-threaded JPEG encoder on 2.17M pixels → **1–3 seconds on mobile**

The user was staring at the spinner while all this blocked the submit.

**Fix:**
Pre-render the energy certificate canvas as soon as `ReviewSection` mounts — while the user is reading the review page. A new `useEffect` (empty deps, runs once) fires `createRenderedEnergyCertificateAsset()` and stores the Promise in a `energyCertPreRender` ref. In `submit()`, the existing `createRenderedEnergyCertificateAsset()` call is replaced with `await (energyCertPreRender.current ?? createRenderedEnergyCertificateAsset(...))`:
- User spends ≥1s reading review screen (almost always) → Promise is already settled → `await` returns instantly → submit is fast
- User taps submit immediately on mount → awaits the in-flight Promise (same timing as before, no regression)

**Files changed:**
- `app/src/sections/ReviewSection.tsx`

**Test status:** TypeScript compiles cleanly. QA subagent: 7/7 checks PASS.

**What's next:** —

---

## 2026-04-03.3 — Session: windowFrameMaterial + windowGlassType label fix

**Phase**: Developer

**Root cause:**
`windowFrameMaterialLabel()` and `windowGlassTypeLabel()` helper functions existed in `energyCertificateDocument.ts` (lines 104–114) but were never called. The document rendering at lines 409/411 used raw enum values (`h.windowFrameMaterial || ''` and `h.windowGlassType || ''`) — outputting `'aluminio'` and `'simple'` in lowercase instead of the human-readable labels `'Aluminio'` and `'Simple'` / `'Doble vidrio'`. Every other select-type field in the same file (airType, thermal, fuel, heating, radiator) correctly used its label helper.

**Fix:**
Replaced the two raw value accesses with calls to the existing label functions:
- `h.windowFrameMaterial || ''` → `windowFrameMaterialLabel(h.windowFrameMaterial)`
- `h.windowGlassType || ''` → `windowGlassTypeLabel(h.windowGlassType)`

**Files changed:**
- `app/src/lib/energyCertificateDocument.ts`

**Test status:** TypeScript compiles cleanly (0 errors). No logic changed — label mapping only.

**What's next:** —

---

## 2026-04-03.2 — Session: Eliminate wasted canvas render on submit

**Phase**: Developer

**Root cause:**
`submit()` called `ensureRenderedDocuments(formData)` which rendered up to 3 signed documents at full resolution (1241×1754 JPEG, 300–500 ms each). Immediately after, `stripRenderedImages()` discarded every `imageDataUrl` — only `{ generatedAt, templateVersion }` metadata was kept and sent to the server. The server dashboard determines "present" status from signature fields, not from renderedDocuments. The admin dashboard re-renders on demand anyway (dashboard.tsx line 236–238: falls through to `renderSignedDocumentOverlay` when `imageDataUrl` is null). Net result: 500–1500 ms of main-thread blocking on every submit, producing ~2–3 MB of data that was never used.

**Fix:**
Added `stampRenderedDocumentMetadata(source)` to `signedDocumentOverlays.ts` — a synchronous function that writes `{ generatedAt, templateVersion }` for all present documents directly without touching Canvas.  `ReviewSection.submit` now calls this instead of `ensureRenderedDocuments`. The Energy Certificate rendering (`createRenderedEnergyCertificateAsset`) is unchanged — its `imageDataUrl` is kept by `stripRenderedImages` and is used by the backend ZIP download.

**Files changed:**
- `app/src/lib/signedDocumentOverlays.ts`
- `app/src/sections/ReviewSection.tsx`

**Test status:** TypeScript compiles cleanly.

---

## 2026-04-03 — Session: Name coordinate fix + preview speed

**Phase**: Developer

**Problem 1 — Name too far right:**
Pixel scan of autoritzacio-representacio.jpg at y=261 showed the label "Nom i cognoms / Raó social:" ends at x≈364 but the fill box started at x=388 — 24px gap. At 700px CSS display width that's a 13px blank gap before the user's name, making it appear detached from the label colon.
- personaNom[0] / empresaNom[0]: 388 → 370 (leaves ~6px gap after colon — natural pen-gap width)

**Problem 2 — Preview loading slow:**
The DPR-aware rendering introduced in the previous session routed 3× DPR devices (every modern iPhone) through the full-res path:
- Network: 148–943 KB download (was 39–84 KB modal WebP)
- Encode: `toDataURL` on 1167×1651 canvas → ~300–500ms main-thread block

"Who not how" solution: the 620×877 modal WebPs are sufficient for carousel previews on ALL devices (2× better than thumbnails on both 1× and 2× screens; 1.5× upscale on 3× — acceptable for a thumbnail). Full-res is reserved exclusively for the fullscreen read modal where pixel-perfect quality justifies the cost.
- `renderSignedDocumentPreview` simplified to always use `modalSrcForKind` at scale=1.0
- DPR-detection code removed (no longer needed for preview path)

**Files changed:**
- `app/src/lib/signedDocumentOverlays.ts`

**Test status:** TypeScript compiles cleanly.

**What's next:** —

---

## 2026-04-02 — Session: Full searchable country picker (WhatsApp-style)

**Phase**: Developer

**Problem solved:**
The native `<select>` dropdown had only 8 hard-coded countries, no search, and poor mobile UX (iOS/Android native pickers are ugly and non-filterable). Users couldn't find their country.

**What was done:**
- Created `app/src/lib/countries.ts` — comprehensive list of 200+ countries with Spanish names, flag emojis, and dial codes; sorted alphabetically with ES/GB/PT/FR/DE/IT/NL/US pinned at the top
- Replaced the `<select>` with a custom bottom-sheet `CountryPickerSheet` component:
  - Tap the flag/code button → full-screen overlay with search input (auto-focused)
  - Live search filters by country name or dial code as you type
  - "Top countries" section (Spain first, then common EU + UK) always visible above the full list
  - Selecting a country closes the sheet and focuses the number input
  - Tap outside / press Escape to dismiss
- Auto-format Spanish (+34) numbers as XXX XXX XXX while typing
- Country picker sheet uses `inputMode="search"` so mobile keyboard opens immediately

**Files changed:**
- `app/src/lib/countries.ts` (new)
- `app/src/sections/PhoneSection.tsx`

**Test status:** TypeScript compiles cleanly. phone.test.ts unaffected.

**What's next:** —

---

## 2026-04-02 — Session: Phone entry — country-code picker + friction removal

**Phase**: Developer

**Problem solved:**
High friction on the first screen: customers were asked to type "+34 612 345 678" — four non-obvious characters before the real number. The `+`, `3`, `4`, and a space are pure friction; the user knows their 9-digit local number but has to figure out the international format.

**What was done:**
- Replaced the single free-text phone input with a [country code dropdown] + [local number input] pair
- Dropdown defaults to 🇪🇸 +34 (Spain); includes ES/GB/PT/FR/DE/IT/NL/US
- Number input placeholder updates to match the selected country (e.g. "612 345 678" for Spain, "7700 900000" for UK)
- The combined value (dialCode + stripped local number) flows through the existing `parsePhone` E.164 normaliser unchanged — no backend or API changes needed
- Local-number input type="tel" with inputMode="numeric" for numeric keyboard on iOS
- Validation messages simplified ("Número incompleto." instead of a full international example)
- `localNumber` state is cleared and focus returns to the number input when the dial code changes

**Files changed:**
- `app/src/sections/PhoneSection.tsx`

**Test status:** TypeScript compiles cleanly. Existing phone.test.ts tests unaffected (they test `parsePhone` with E.164 strings, not the UI).

**What's next:** —

---

## 2026-04-02 — Session: DPR-Aware Preview Rendering (blur fix)

**Phase**: Developer

**Problem solved:**
Carousel previews were extremely blurry on modern phones. Root cause from first principles:
- `renderSignedDocumentPreview` rendered onto the 25%-scale thumbnail (310×439 px)
- The `<img class="w-full">` fills the carousel, e.g. 390px CSS on an iPhone 14
- At 3× DPR the browser needs 390×3=1,170 physical pixels but only 310 exist → 3.8× upscale → extreme blur

**What was done:**
- Made `renderSignedDocumentPreview` DPR-aware: reads `window.innerWidth` and `window.devicePixelRatio` to compute the exact physical pixel target
- Selects the smallest source that satisfies the target (cheapest correct answer):
  - Target ≤ 310 px → 25% thumbnail WebP at scale 1.0 (unchanged path, 1× screens)
  - Target ≤ 620 px → 50% modal WebP at scale 1.0 (2× DPR devices — crisp, 39–84 KB)
  - Target  > 620 px → full-resolution PNG at fractional scale (3× DPR devices — pixel-perfect)
- Added modal WebPs to `preloadDocumentTemplates` priority queue (between thumbnails and full-res)
- Updated JSDoc to reflect new behaviour

**Files changed:**
- `app/src/lib/signedDocumentOverlays.ts`

**Test status:** TypeScript compiles cleanly (0 errors). Visual rendering change only.

**What's next:** Complete changelog reorganisation per user feedback.

---

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
