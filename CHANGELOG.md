## 2026-04-07.16 — Session: DNI/NIE Optional-Back Upload

**Phase**: Developer + QA

**Feature**: Front photo alone is now sufficient for DNI/NIE upload. Back side is optional enrichment (extracts address data if present) but is never required for form completion.

**Why**: Spanish installers often scan both DNI sides onto a single page, or the customer only has a clear front photo. Requiring the back was an unnecessary blocker.

**Changes:**

1. **`app/src/lib/identityDocument.ts` — `isIdentityDocumentComplete`**:
   Simplified to `return !!dni.front.photo;`. Removed the DNI-card exception that required both sides.

2. **`app/src/lib/identityDocument.ts` — `getIdentityDocumentPendingLabel`**:
   Removed "Falta la trasera" case. Function now only returns "Falta la frontal" (back present, front missing) or null.

3. **`app/src/lib/identityDocument.ts` — `getIdentityDocumentDoneLabel`**:
   Added label for front-only DNI card: "DNI / NIE — cara principal". NIE cert/card labels unchanged.

4. **`app/src/sections/PropertyDocsSection.tsx` — `DNICard` UI**:
   Description updated to "Sube tu DNI o NIE — una o dos fotos. Con solo la cara principal es suficiente."
   Back-slot empty state relabelled "Reverso / (opcional)".

**Post-audit fixes** (caught during review):
- `getIdentityDocumentDoneLabel` was missing a catch-all for passport and any unknown kind — it returned the empty `'DNI / NIE'` label even when front was uploaded. Fixed with a `if (dni.front.photo) return 'DNI / NIE — cara principal'` fallback after the NIE-specific branches.
- `ReviewSection.tsx` hint text still said "DNI por ambas caras o NIE válido" — updated to "DNI, NIE o pasaporte — una cara es suficiente".
- Added regression test: passport (kind='passport') with front → `getIdentityDocumentDoneLabel` returns "DNI / NIE — cara principal".

**Architecture unchanged**: `DNIData.{ front, back }` type unchanged. `dniAutoBatch` already handled 1 or 2 images. No backend changes needed.

**Tests**: 65/65 pass — 25 new tests in `app/src/lib/identityDocument.test.ts` covering all completion, pending-label, done-label scenarios, and passport regression.

**Files changed**:
- `app/src/lib/identityDocument.ts`
- `app/src/sections/PropertyDocsSection.tsx`
- `app/src/sections/ReviewSection.tsx`
- `app/src/lib/identityDocument.test.ts` (new)

---

## 2026-04-07.15 — Session: Customer Name Resolution Fix

**Phase**: Developer + QA

**Bug 1 — Webhook sends "Cliente nuevo"**: `fireDocFlowNewOrder` used `project.customerName` (database value, defaulting to `'Cliente nuevo'` on project creation) instead of the freshly-derived name from the submitted formData. The function already computed `snapshot = getProjectSnapshot(project.formData)` but ignored `snapshot.fullName`.

**Bug 2 — Success screen shows "¡Todo listo, Cliente!"**: After submission, `project` state in the frontend was never updated with the resolved customer name. `SuccessSection` received the original stale `project.customerName` ('Cliente nuevo'), split on space, and showed 'Cliente'.

**Fixes:**

1. **`backend/server.js` `fireDocFlowNewOrder` (line 956)**:  
   `customer_name: project.customerName || ''` → `customer_name: snapshot.fullName || project.customerName || ''`  
   `snapshot.fullName` is already computed and mirrors the dashboard display logic (`contract → DNI front → electricity titular → IBI titular`).

2. **`app/src/App.tsx` `onSuccess` callback (line 621)**:  
   Before calling `goTo('success')`, resolve the customer name from the current `formData` using the same priority chain (contract → DNI front → IBI → electricity). If a name is found and differs from the stored `project.customerName`, update the project state via `setProject(...)`. `SuccessSection` then receives the correct name.

**Tests**: 19/19 pass covering: DNI name in front slot (normal), old combined-image bug (name in back slot), fixed combined-image flow, electricity-only, IBI-only, contract-priority, no-documents fallback.

**Files changed**:
- `backend/server.js` (webhook customer_name priority fix)
- `app/src/App.tsx` (onSuccess project name update)

---

## 2026-04-07.14 — Session: DNI Combined-Image Extraction Bug Fix

**Phase**: Developer + QA

**Bug**: When a customer uploaded a single photo showing BOTH sides of their DNI, the AI returned name, DNI number AND address/municipality in one result. The old `normalizeIdentityExtraction` logic saw `hasAddressData=true` and unconditionally set `side='back'`. The frontend then called `onBackExtractionChange()` — putting name+address in the back slot while the front slot stayed empty. The UI showed the name field blank and address filled incorrectly.

**Root cause**: Two bugs working together:
1. `dniAutoBatch` AI prompt had no instruction for combined images — AI mixed front+back data freely.
2. `normalizeIdentityExtraction` treated "has address data" as a definitive back-side signal, even when front-side identity data was also present.

**Fix 1 — `dniAutoBatch` prompt** (`backend/server.js` line ~1836): Added explicit "COMBINED IMAGE RULE" block:
- If both sides visible in one photo → `side: "front"`, extract only front fields, set address/municipality/province/placeOfBirth to null, add "combined image" to notes.

**Fix 2 — `normalizeIdentityExtraction`** (`backend/server.js` line ~1936):
- `hasAddressData && !hasIdentityCore` → side = 'back' (pure back-side photo — unchanged)
- `hasAddressData && hasIdentityCore` → side = 'front' (combined image — AI took priority, default 'front')
- Defence layer: if `side='front'`, strip all 4 address fields; if `side='back'`, strip all 8 identity fields.

**Frontend** (already correct — no changes needed): Line 846 of `PropertyDocsSection.tsx` routes `side === 'back'` to `onBackExtractionChange` and everything else to `onFrontExtractionChange`.

**Tests**: 26/26 unit tests pass covering: combined image (no AI side), combined image (AI set front), pure back, pure front, passport, NIE-certificate, explicit back cue, whitespace normalization.

**Files changed**:
- `backend/server.js` (dniAutoBatch prompt + normalizeIdentityExtraction)

---

## 2026-04-06.13 — Session: PRD v2.1 — All 6 Bug Fixes

**Phase**: Developer + QA (full coding → testing loop per issue)

**Issues resolved (in priority order):**

1. **Issue 6 — Material Radiadores conditional** (`app/src/sections/EnergyCertificateSection.tsx`, `app/src/lib/energyCertificateValidation.ts`): Field now hidden unless `heatingEmitterType` is explicitly a radiator type. Validation updated to match. Auto-reset to `no-aplica` on switch to suelo-radiante, back to `null` on return.

2. **Issue 5 — Continue button stuck on re-upload** (`app/src/sections/PropertyDocsSection.tsx`): `ElectricityCard` now removes processed items from `pendingItems` after `onAddPages` succeeds. 30-second safety timeout added for hung extractions.

3. **Issue 1 — Phone stale state / cookie poisoning** (`app/src/App.tsx`, `app/src/sections/PhoneSection.tsx`): 404/PROJECT_NOT_FOUND now redirects to phone form instead of error screen. Stale local backup cleared on redirect. `PhoneSection` resets `localNumber`, `touched`, `error`, `newEmail`, `newAssessor`, and `selectedProducts` on failed lookup.

4. **Issue 2 — n8n double webhook fire** (`backend/server.js`): Verified already correctly implemented — first submit fires only `new_order` (with `docs_uploaded`), subsequent submits fire only `doc_update`, failure rolls back the flag.

5. **Issue 3 — Swipe on representation carousel** (`app/src/sections/RepresentationSection.tsx`): `touchAction: pan-x` on scroll container, `pointerEvents: none` on slide images, `scrollend` listener + `onTouchEnd` 300ms fallback for iOS Safari compatibility.

6. **Issue 4 — Extraction field coverage** (`backend/server.js`, `app/src/sections/EnergyCertificateSection.tsx`, `app/src/lib/energyCertificateValidation.ts`, `app/src/types/index.ts`): Province/municipality fallback chains extended to include IBI. `firstName`/`lastName` derived from `fullName` when DNI absent. `tipoFase` and `cups` from EB auto-fill EC form (`tipoFase` shows as confirmation-required suggestion). Types extended.

**Files changed:**
- `app/src/sections/EnergyCertificateSection.tsx`
- `app/src/sections/PropertyDocsSection.tsx`
- `app/src/sections/PhoneSection.tsx`
- `app/src/sections/RepresentationSection.tsx`
- `app/src/App.tsx`
- `app/src/lib/energyCertificateValidation.ts`
- `app/src/types/index.ts`
- `backend/server.js`
- `CHANGELOG.md`
- `AGENTS.md`

**Tests**: Each issue verified by a dedicated test subagent in a new context window. Final comprehensive review passed. No TypeScript errors. Both workflows running clean.

---

## 2026-04-05.12 — Session: Dashboard Link & Follow-up Routing Fix (T001)

**Phase**: Developer

**Fixes:**

- **Dashboard.tsx**: Removed `token` parameter from `buildProjectUrl` and its usage. The dashboard-generated "Abrir formulario" link now produces `/?code=CODE&source=assessor` (no token, as the backend no longer requires it).
- **App.tsx**: Updated `getInitialSection` to ensure all follow-up projects (those with representation data) land on the `review` section by default. This allows customers to see their progress summary and selectively upload missing documents rather than being forced into the property-docs sequence.
- **Dashboard.tsx**: Removed redundant `detail.accessToken` check when opening the customer form, as tokens are no longer used for authentication in the customer flow.

**Files changed:**
- `app/src/pages/Dashboard.tsx`
- `app/src/App.tsx`
- `CHANGELOG.md`
- `AGENTS.md`


**Phase**: Developer

**Fixes in `backend/server.js`:**

- **IBI RC post-processing**: 
  - Added repeating-character check: if the Referencia Catastral (stripped) contains 4+ identical consecutive characters, it is nulled and a warning is added.
  - Added "all-null" safety check: if RC, titular, and direccion are all missing but AI said the document was correct, it is overridden to `isCorrectDocument: false` (rejects blanks/templates that AI missed).
  - Applied to both single `/api/extract` and batch `/api/extract-batch` routes.
- **Electricity prompt hardening**:
  - Explicitly lists gas, water, and phone/internet bills as wrong documents.
  - Added blank/placeholder/template detection rules.
  - Added screen-photo guidance ("Photos taken of a screen or monitor are acceptable...").
  - Cleaned up prompt structure for better instruction following.

**Files changed:**
- `backend/server.js`
- `CHANGELOG.md`
- `AGENTS.md`

**Phase**: Developer

**Problems fixed (from n8n logs):**

1. **`dni_front` / `dni_back` missing from `doc_update`** — `extractCompletedDocKeys` had three weaknesses:
   - No fallback to the project's previously-stored formData (follow-up sessions submit new docs but the DNI was uploaded in session 1 — the submitted formData has `photo: null` for DNI, and without `existingFormData`, both signals were falsy)
   - Wrong `assetFiles` key names: `assetFiles?.ibiPhoto` should be `Object.keys(af).some(k => k.startsWith('ibi_'))`, and `assetFiles?.electricityPage0` should use `electricity_` prefix
   - No fallback for AI extraction data (if DNI was extracted, the photo was definitely present)

2. **No webhook origin validation** — A stray WhatsApp message was mistakenly POSTed to the n8n DocFlow webhook URL. Our backend had no secret header, so n8n couldn't distinguish legitimate Eltex calls from random POSTs.

**Fixes in `backend/server.js`:**

- `extractCompletedDocKeys(formData, assetFiles, existingFormData = null)` — new third parameter
  - DNI: `formData.dni.front.photo || assetFiles.dniFront || formData.dni.front.extraction || existingFormData.dni.front.photo`
  - IBI: `Object.keys(af).some(k => k.startsWith('ibi_'))` (fixes `ibiPhoto` key bug)
  - Electricity: `Object.keys(af).some(k => k.startsWith('electricity_'))` (fixes `electricityPage0` key bug)
- Submit route captures `existingFormData = project.formData` BEFORE overwriting, passes to `extractCompletedDocKeys`
- Both `fireDocFlowNewOrder` and `fireDocFlowDocUpdate` now include `X-Eltex-Webhook-Secret` header (if `ELTEX_DOCFLOW_WEBHOOK_SECRET` env var is set)
- Added `console.log([DocFlow] ${code} docs detected: ...)` for visibility in Railway logs

**QA (6 scenarios, all pass):**
- Scenario 1: follow-up session, photo null in submit but truthy in existingFormData → `dni_front`, `dni_back` detected ✓
- Scenario 2: assetFiles `dniFront`/`dniBack`/`ibi_0` → all detected ✓
- Scenario 3: extraction data only (no photo, no assetFiles) → `dni_front`, `dni_back` ✓
- Scenario 4: assetFiles `electricity_0`, `electricity_1` → `electricity_bill` ✓
- Scenario 5: nothing present → `[]` ✓
- Scenario 6: ELT20250001 real project → `['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate']` ✓
- Live submit test: backend log shows `[DocFlow] ELT20250001 docs detected: dni_front, dni_back, ibi, electricity_bill` ✓

**Webhook secret — built-in default, no Railway config needed:**
```js
const DOCFLOW_WEBHOOK_SECRET = process.env.ELTEX_DOCFLOW_WEBHOOK_SECRET || 'eltex-docflow-2026-v1';
```
Both `new_order` and `doc_update` always send `X-Eltex-Webhook-Secret: eltex-docflow-2026-v1`. Override via env var if needed. n8n should validate this header to reject non-Eltex payloads.

**Files changed:**
- `backend/server.js`
- `AGENTS.md` (new env var)

---

## 2026-04-05.9 — Session: DocFlow webhook sequence fix (new_order before doc_update)

**Phase**: Developer

**Root cause**: n8n's DocFlow flow requires a Baserow row to exist before `doc_update` can update it. The row is created by `new_order`. Previously the backend only ever fired `doc_update` — so n8n looked for the row, found nothing, and stopped. No row was ever created.

**First-principles fix (two layers):**

1. **On project creation** (`POST /api/project/create`): fire `new_order` fire-and-forget after `saveDB()`. On success, set `project.docflowNewOrderSent = true` and save — so the submit route knows the row already exists.

2. **On submit** (`POST /api/project/:code/submit`): after `res.json()` (non-blocking), check `!project.docflowNewOrderSent`. If the flag is absent (project created before this fix, or creation webhook failed), **await** `fireDocFlowNewOrder` before firing `fireDocFlowDocUpdate`. Awaiting guarantees the Baserow row exists before the update arrives. This silently fixes all ~50 existing projects in the DB without any migration.

**New helpers in `backend/server.js`:**
- `computeRequiredDocs(productType)` — returns `["dni_front", "dni_back", "ibi", "electricity_bill", "energy_certificate"]`
- `fireDocFlowNewOrder(project)` — async, awaitable, fires `new_order` payload, returns boolean success
- `fireDocFlowDocUpdate(orderCode, docsUploaded)` — fire-and-forget `doc_update` (renamed from `fireDocFlowWebhook`)

**`new_order` payload:**
```json
{
  "type": "new_order",
  "order_id": "ELT20260054",
  "customer_name": "...",
  "phone": "+34...",
  "contract_date": "2026-04-05",
  "docs_required": ["dni_front", "dni_back", "ibi", "electricity_bill", "energy_certificate"]
}
```

**Verified:**
- New project creation: `[DocFlow] new_order sent for ELT20260054` ✓ in backend logs
- `docflowNewOrderSent: true` persisted to db.json for new project ✓
- Existing projects (`ELT20250001`, `ELT20250002`, etc.): `docflowNewOrderSent: MISSING` → will correctly await `new_order` on next submit before firing `doc_update` ✓

**Files changed:**
- `backend/server.js`

---

## 2026-04-05.8 — Session: Delete project from dashboard

**Phase**: Developer

**Feature**: Admin assessors can now permanently delete any project from the dashboard.

**First-principles impact of deletion:**
- `database.projects[code]` removed and persisted to db.json
- `uploads/assets/:code/` directory deleted recursively from disk (all uploaded files purged)
- Customer form URL returns `PROJECT_NOT_FOUND` automatically — no extra handling needed
- CSV export / ZIP download naturally exclude the deleted project
- Dashboard row removed immediately from frontend state (no page reload)
- Detail cache entry evicted — no stale reference remains

**Backend (`backend/server.js`):**
- New `DELETE /api/dashboard/project/:code` route — requires `x-dashboard-token` auth
- Removes asset directory with `fs.promises.rm(dir, { recursive: true, force: true })`
- Deletes from `database.projects`, calls `saveDB()`

**API service (`app/src/services/api.ts`):**
- Added `deleteProject(code, dashboardToken)` — fires `DELETE /api/dashboard/project/:code`

**Frontend (`app/src/pages/Dashboard.tsx`):**
- Imported `Trash2` icon; imported `deleteProject` from api
- `ProjectTableRow` gets `onDelete` prop + `deleteState` + `confirmTimeoutRef`
- 3-state delete UX: idle → "Eliminar expediente" (red outline); confirm → "Confirmar / Cancelar" pair (auto-reverts to idle after 4 s); deleting → spinner
- `DashboardPage.handleDeleteProject`: evicts cache entry, removes project from state — row unmounts immediately, taking any open modals with it

**Verified:**
- TypeScript: 0 errors
- DELETE endpoint tested: project existed → `{"success":true}` → subsequent GET returns `PROJECT_NOT_FOUND` ✓

**Files changed:**
- `backend/server.js`
- `app/src/services/api.ts`
- `app/src/pages/Dashboard.tsx`

---

## 2026-04-05.7 — Session: DocFlow webhook integration (`doc_update`)

**Phase**: Developer

**Feature**: The form backend now fires a fire-and-forget `doc_update` webhook to the DocFlow API after every successful customer form submission. This closes the loop between the upload form and the n8n/Baserow automation that drives WhatsApp reminders and status updates.

**Implementation:**

1. **`backend/server.js` — `extractCompletedDocKeys(formData, assetFiles)`**: New helper that inspects submitted `formData` and `project.assetFiles` to produce an array of document keys (`dni_front`, `dni_back`, `ibi`, `electricity_bill`, `energy_certificate`, Cataluña/Spain signed-doc keys) matching the DocFlow key schema.

2. **`backend/server.js` — `fireDocFlowWebhook(orderCode, docsUploaded)`**: New helper that reads `ELTEX_DOCFLOW_WEBHOOK_URL` from env and fires a `POST { type, order_id, docs_uploaded }` call. Returns immediately — the `fetch` `.catch()` logs errors without blocking the customer response. If the env var is not set, it no-ops silently.

3. **`POST /api/project/:code/submit`**: After `saveDB()`, calls `extractCompletedDocKeys(formData, project.assetFiles)` and then `fireDocFlowWebhook(project.code, docsUploaded)`.

**Testing:**
- **Unit tests (5 scenarios)**: `extractCompletedDocKeys` validated for: formData-only photos, assetFiles-fallback (preview stripped), Cataluña signed docs, empty input, Madrid signed docs. All passed.
- **E2E submit test**: `POST /api/project/ELT20250001/submit` returned `{ success: true }` — the webhook no-ops silently when URL is unset, no blocking.
- **Live webhook fire**: Ran the `fireDocFlowWebhook` function with `ELTEX_DOCFLOW_WEBHOOK_URL=https://httpbin.org/post` — httpbin confirmed HTTP 200 and echoed back the exact payload `{ type: "doc_update", order_id: "ELT20250001", docs_uploaded: [...] }`.

**Environment variable required in Railway:**
```
ELTEX_DOCFLOW_WEBHOOK_URL = https://<docflow-api-domain>/api/webhooks/doc-flow
```

**Files changed:**
- `backend/server.js`
- `AGENTS.md` (env vars table)

---

## 2026-04-05.6 — Session: Dashboard signature deferred state

**Phase**: Developer

**Feature**: The admin dashboard now distinguishes three signature states per signed document:
- **Complete** (green): customer has signed — PDF download/view enabled.
- **Firma diferida** (amber): customer explicitly clicked "Firmar más tarde" — amber card with warning icon and informative message.
- **Pendiente** (gray): customer has not yet reached the signature step.

Previously both "deferred" and "pending" showed identically as gray "Pendiente", giving assessors no signal that a customer had actively chosen to defer.

**Implementation:**
1. **`app/src/lib/dashboardProject.ts`**: Added `status: 'complete' | 'deferred' | 'pending'` field to `DashboardSignedPdfItem` interface. Updated `getDashboardSignedPdfItems` to read `formData.representation.signatureDeferred` and set `status` accordingly.
2. **`backend/server.js` — `buildDashboardSummary`**: Added `signatureDeferred` derivation and `status` field on all signed document items in the Cataluña and Madrid/Valencia branches.
3. **`app/src/pages/Dashboard.tsx`**: Updated `SignedDocumentsSection` (detail panel) and `SignedPdfsTableCell` (list table) to render three distinct visual states: emerald (complete), amber (deferred), gray (pending).

**TypeScript**: 0 errors. Both workflows running cleanly.

**Files changed:**
- `app/src/lib/dashboardProject.ts`
- `backend/server.js`
- `app/src/pages/Dashboard.tsx`

---

## 2026-04-05.5 — Session: Dashboard "No se encontraron archivos" bug fix

**Phase**: Developer

**Root cause:**
The dashboard was unable to display or download uploaded documents. The error "No se encontraron archivos descargables para este documento." appeared on every document action (view/download) in the admin dashboard.

**First-principles analysis:**
1. `useFormState.ts` strips all `preview` fields before auto-saving to the server (JSON replacer, line 334: `if (_key === 'preview') return undefined`). This keeps payloads small but means `db.json` has no image data in `formData.*.photo.preview`.
2. Photos ARE separately uploaded as binary files via `preUploadAssets` → `/api/project/:code/upload-assets`. Paths stored in `project.assetFiles` (e.g. `{ "dniFront": "/uploads/assets/ELT123/dniFront.jpg" }`).
3. `serializeProject` (used by `/api/dashboard/project/:code`) did NOT include `assetFiles` in its output — the frontend had no knowledge of the disk paths.
4. `getDocumentAssetsFromProject` and `getElectricityAssetsFromProject` only read `formData.*.photo.preview` → always null → `resolveAssets` returned `[]` → alert fired.
5. The dashboard list `present` flags for DNI front, DNI back, and electricity pages were also `false` (checked only preview) even when files were on disk.

**Fix (4 targeted changes):**
1. **`app/vite.config.ts`**: Added `/uploads` to Vite dev proxy so asset file URLs work in development.
2. **`backend/server.js` — `serializeProject`**: Added `assetFiles: project.assetFiles || {}` to serialized output.
3. **`backend/server.js` — `buildDashboardSummary`**: Fixed `present` flags — DNI front, DNI back, and electricity pages now check `project.assetFiles` as fallback alongside stripped preview.
4. **`app/src/pages/Dashboard.tsx` — `getDocumentAssetsFromProject` and `getElectricityAssetsFromProject`**: Added fallback logic — when `dataUrl` is null (stripped preview), uses `project.assetFiles` path. Existing utility functions (`openDataUrlInNewTab`, `downloadDataUrlAsset`) already handle regular URL paths.

**TypeScript**: 0 errors. Both workflows running cleanly.

**Files changed:**
- `app/vite.config.ts`
- `backend/server.js`
- `app/src/pages/Dashboard.tsx`

---

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
