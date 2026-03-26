# Eltex Digital Onboarding — Implementation Plan & Technical Reference

> **Last updated:** March 26, 2026 (Session 6 — bug fixes)  
> **Status:** Active development  
> **Stack:** React (Vite) + Node.js (Express) + `db.json` file database

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Form Flow (Customer)](#3-form-flow-customer)
4. [Data Model & Schema](#4-data-model--schema)
5. [AI Extraction](#5-ai-extraction)
6. [Signed Documents & Rendering](#6-signed-documents--rendering)
7. [Backend API Endpoints](#7-backend-api-endpoints)
8. [Dashboard (Admin)](#8-dashboard-admin)
9. [Completed Work (Changelog)](#9-completed-work-changelog)
10. [Known Bugs & Edge Cases](#10-known-bugs--edge-cases)
11. [Pending Work & TODO](#11-pending-work--todo)
12. [File Map](#12-file-map)

---

## 1. Project Overview

Eltex is a Spanish solar and aerothermal energy company. This tool digitises the customer onboarding process:

- Customers upload identity and property documents (DNI, IBI, electricity bill)
- AI extracts structured data from uploaded images
- Customers sign legal representation documents digitally
- Admin staff monitor all submissions via a dashboard and can download signed PDFs or ZIP archives

**Product types:** `solar` | `aerothermal`  
**Supported regions:** Cataluña, Madrid, Valencia, Otra provincia

---

## 2. Architecture

```
app/              React frontend (Vite, port 5173 in dev)
  src/
    pages/        Dashboard.tsx, DashboardLogin.tsx
    sections/     One file per form step
    hooks/        useFormState.ts (core state machine)
    lib/          signedDocumentOverlays.ts, dashboardProject.ts, provinceMapping.ts, …
    config/       documentSpec.ts (single source of truth for document rendering)
    types/        index.ts (all TypeScript types)
    services/     api.ts (all fetch calls)
    components/   SignaturePad.tsx, PhotoUpload.tsx, …

backend/
  server.js       All Express routes + AI extraction + PDF generation
  db.json         File-based database (all projects)

public/           Template images for signed documents (PNGs/JPEGs)
```

**Dev routing:** Frontend runs at `:5173`, proxied through Express at `:3001`. All API calls use relative paths (`/api/…`). In local development, use the Express server on `:3001`.

**Auth:**
- Customer form: `x-project-token` header (per-project token stored in `db.json`)
- Admin dashboard: `x-dashboard-token` header (session token, validated against in-memory `dashboardSessions` Set)

---

## 3. Form Flow (Customer)

```
[Phone lookup]  →  [Property Docs]  →  [Province Selection]  →  [Representation]  →  [Review]  →  [Success]
```

### Step 1 — Phone Section (`PhoneSection.tsx`)
- User enters phone number or arrives via magic link `/?code=ELT…`
- Backend lookup: `GET /api/lookup/phone/:phone`
- On success: redirects to `/?code=CODE` and sets section to `property-docs`

### Step 2 — Property Docs (`PropertyDocsSection.tsx`)
Uploads and AI-extracts three document types:

| Field | Document type | AI prompt key |
|-------|--------------|---------------|
| DNI front | `dni-front` | Extracts name, DNI number, birth date, expiry |
| DNI back | `dni-back` | Extracts address, municipality, province |
| IBI / Escritura | `ibi` | Extracts catastral ref, owner name, NIF, address, amount |
| Electricity bill (multi-page) | `electricity-bill` | Extracts CUPS, power, phase, address, province |

**Province rule:** Province is extracted **only** from the electricity bill. DNI/IBI province is never used to auto-assign location.

Each upload goes through:
1. Client-side image validation (min resolution, file size)
2. JPEG compression (client-side canvas)
3. `POST /api/extract` → AI extraction → structured JSON
4. Auto-save via debounced `POST /api/project/:code/save`

**Electricity bill:** multi-page support. Pages stored as `electricityBill.pages[]` (migrated from old `front`/`back` format).

### Step 3 — Province Selection (`ProvinceSelectionSection.tsx`)
- Displays auto-detected province (from electricity bill) and maps it to a location region
- User confirms or manually overrides
- Collects company representation data (optional): `isCompany`, `companyName`, `companyNIF`, `companyAddress`, etc.
- **`other` province:** Goes directly to Review (no legal docs needed)
- **Known bug:** `hasRepresentationDone` returns `false` for `other` even though no signing is required → user stuck on Representation step (fix pending, see §11)

### Step 4 — Representation (`RepresentationSection.tsx`)
- Shows carousel of legal documents pre-filled with extracted data
- Single shared signature pad signs all docs at once
- On "Continuar": renders each document to JPEG via canvas, stores `renderedDocuments` in formData
- **`other` location:** Returns empty `docs[]` → currently creates a dead-end (fix pending, see §11)

**Documents by location:**

| Location | Documents |
|----------|-----------|
| Cataluña | Certificat 10% IVA + Declaració Generalitat + Autorització de Representació |
| Madrid / Valencia | Certificat 10% IVA (ES) + Poder de Representación |
| Otra | None |

### Step 5 — Review (`ReviewSection.tsx`)
- Checklist of all completed items
- Calls `ensureRenderedDocuments()` which checks template version and skips already-rendered docs
- Submits via `POST /api/project/:code/submit`
- Submission payload strips `imageDataUrl` from `renderedDocuments` to reduce upload size (dashboard re-renders on demand)

### Step 6 — Success (`SuccessSection.tsx`)
- Simple confirmation screen

### Navigation guard (`App.tsx` — `getInitialSection`)
When a project is loaded via `/?code=…`, the app determines the correct starting section:
```
hasRepresentationDone? → review
location set?          → representation
hasPropertyDocsDone?   → province-selection
default                → property-docs
```

---

## 4. Data Model & Schema

### Project (stored in `db.json`)

```json
{
  "code": "ELT20250001",
  "accessToken": "uuid",
  "customerName": "Juan García",
  "phone": "612345678",
  "email": "juan@example.com",
  "productType": "solar",
  "assessor": "María López",
  "assessorId": "ASESOR-001",
  "createdAt": "2025-01-01T10:00:00.000Z",
  "lastActivity": "2025-01-02T12:00:00.000Z",
  "formData": { ... },
  "submissions": [ { "id": "uuid", "timestamp": "...", "source": "customer", "formData": {...} } ],
  "cataloniaPDFs": { "canGenerateRepresentacio": true, "canGeneratePoder": false }
}
```

### FormData (TypeScript type `FormData`)

```typescript
{
  dni: {
    front: DocSlot,   // { photo: UploadedPhoto | null, extraction: AIExtraction | null }
    back: DocSlot,
  },
  ibi: {
    photo: UploadedPhoto | null,
    extraction: AIExtraction | null,
  },
  electricityBill: {
    pages: DocSlot[],   // multi-page, migrated from old { front, back }
  },
  electricalPanel: { photos: UploadedPhoto[] },
  roof: { photos: UploadedPhoto[], lengthM, widthM, roofType, orientation },
  installationSpace: { photos: UploadedPhoto[], widthCm, depthCm, heightCm },
  radiators: { photos: UploadedPhoto[], radiatorType, totalCount, heatingZones },
  location: LocationRegion | undefined,
  representation: RepresentationData,
  signatures: { customerSignature: string | null, repSignature: string | null },
}
```

### UploadedPhoto

```typescript
{
  id: string,
  preview: string,       // base64 data URL (JPEG, compressed client-side)
  timestamp: number,
  sizeBytes: number,
  width?: number,
  height?: number,
}
```

### AIExtraction

```typescript
{
  extractedData: Record<string, any>,
  confidence: number,          // 0–100
  isCorrectDocument: boolean,
  documentTypeDetected: string,
  needsManualReview: boolean,  // true if confidence < 75
  confirmedByUser: boolean,
  manualCorrections?: Record<string, string>,
}
```

### RepresentationData

```typescript
{
  location: LocationRegion | null,
  isCompany: boolean,
  companyName, companyNIF, companyAddress, companyMunicipality, companyPostalCode,
  postalCode,
  ivaPropertyAddress,
  // Signatures (base64 SVG/PNG data URLs):
  ivaCertificateSignature: string | null,     // Cataluña IVA
  generalitatSignature: string | null,         // Cataluña Generalitat
  representacioSignature: string | null,       // Cataluña Representació
  ivaCertificateEsSignature: string | null,   // Spain IVA
  poderRepresentacioSignature: string | null, // Spain Poder
  // Rendered documents (cached, stripped before upload):
  renderedDocuments?: Partial<Record<RenderedDocumentKey, RenderedDocumentAsset>>,
}
```

### RenderedDocumentAsset

```typescript
{
  imageDataUrl: string,     // base64 JPEG (stripped from upload payload to save bandwidth)
  generatedAt: string,
  templateVersion: string,  // e.g. "2026-03-26.3"
}
```

### LocationRegion

```typescript
'cataluna' | 'madrid' | 'valencia' | 'other'
```

---

## 5. AI Extraction

**Service:** OpenRouter API → Gemini 2.0 Flash  
**Model:** `google/gemini-2.0-flash-001` (set via `OPENROUTER_MODEL` env var, with fallback)  
**Key:** `OPENROUTER_API_KEY` environment secret

### Extraction flow

1. Frontend compresses image to JPEG (client-side canvas)
2. `POST /api/extract` with `{ imageBase64, documentType }`
3. Backend sends image + structured prompt to Gemini
4. Response parsed as JSON → returns `{ extractedData, confidence, needsManualReview, … }`
5. If `needsManualReview: true`, dashboard shows orange "Revisar manualmente" warning

### Document types and extracted fields

**`dni-front`**
- `fullName`, `dniNumber`, `dateOfBirth`, `expiryDate`, `sex`

**`dni-back`**
- `address`, `municipality`, `province`, `placeOfBirth`

**`ibi`**
- `referenciaCatastral`, `titular`, `titularNif`, `direccion`, `codigoPostal`, `municipio`, `provincia`, `ejercicio`, `importe`

**`electricity-bill`**
- `titular`, `nifTitular`, `cups`, `potenciaContratada`, `tipoFase`, `tarifaAcceso`, `comercializadora`, `distribuidora`, `direccionSuministro`, `codigoPostal`, `municipio`, `provincia`, `fechaFactura`, `periodoFacturacion`, `importe`

### Province mapping (`lib/provinceMapping.ts`)

Maps province strings from electricity bill to `LocationRegion`:
- Cataluña: barcelona, girona, gerona, lleida, lerida, tarragona
- Madrid: madrid
- Valencia: valencia, alicante, alacant, castellon, castello, castellon de la plana
- Default: `other`

Normalization: lowercase + strip accents (NFD decomposition).

---

## 6. Signed Documents & Rendering

### Template images (in `/public`)

| Document | Template file | Dimensions |
|----------|--------------|------------|
| Cataluña IVA | `/verify_iva_es_top.png` | 1410×2100 |
| Cataluña Generalitat | `/verify_iva_es_bottom_fixed.png` | 1357×1920 |
| Cataluña Representació | `/autoritzacio-representacio.jpg` | 1241×1754 |
| Spain IVA | `/certificat-iva-10-es.png` | 1410×2100 |
| Spain Poder | `/poder-representacio.png` | 1410×2100 |

### Document rendering pipeline

1. Load template image (same-origin, no CORS issue)
2. Create `<canvas>` at template dimensions
3. Draw template image
4. Overlay text fields using extracted data (DNI name, NIF, address, etc.)
5. Draw signature image (base64 data URL) into signature box
6. Export as `canvas.toDataURL('image/jpeg', 0.92)` → base64 JPEG

**Template version:** `2026-03-26.3`  
If stored `renderedDocuments[key].templateVersion` matches current version, re-render is skipped (optimization).

### `documentSpec.ts` — Single source of truth

All field positions (pixel coordinates `[x1, y1, x2, y2]`) and signature boxes are defined in `src/config/documentSpec.ts`. Used by both:
- `signedDocumentOverlays.ts` (frontend browser rendering)
- `backend/server.js` (server-side PDF generation via `pdf-lib`)

### Signed document kinds (`SignedDocumentKind`)

```typescript
'cataluna-iva' | 'cataluna-generalitat' | 'cataluna-representacio' | 'spain-iva' | 'spain-poder'
```

### PDF generation (dashboard)

`buildSignedPdfFactory` in `Dashboard.tsx`:
1. Tries `getStoredRenderedDocument(project, key)?.imageDataUrl` (cached, but stripped since recent optimisation)
2. Falls back to `renderSignedDocumentOverlay(project, key)` (re-renders from stored signature data)
3. Sends resulting JPEG to `POST /api/generate-image-pdf` → returns PDF blob

---

## 7. Backend API Endpoints

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/project/:code` | Get project data (publicly readable since code-based access is link-restricted) |
| GET | `/api/lookup/phone/:phone` | Look up project by phone number |
| POST | `/api/pdf-to-images` | Convert uploaded PDF to images (returns base64 array) |
| POST | `/api/extract` | AI extraction for a single document |
| POST | `/api/extract-batch` | AI extraction for multiple images |
| POST | `/api/generate-image-pdf` | Wrap a JPEG image into a single-page PDF |

### Project-token auth (`x-project-token`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/project/create` | Create new project |
| POST | `/api/project/:code/save` | Auto-save form progress |
| POST | `/api/project/:code/submit` | Final submission |

### Dashboard auth (`x-dashboard-token`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/dashboard/login` | Admin login (password → session token) |
| POST | `/api/dashboard/logout` | Admin logout |
| GET | `/api/dashboard` | List all projects with summaries |
| GET | `/api/dashboard/export/csv` | Export all project data as CSV |
| GET | `/api/project/:code/download-zip` | Download all project files as ZIP |
| GET | `/api/project/:code/download-manifest` | Download project manifest JSON |
| PUT | `/api/project/:code/admin-formdata` | **Admin document upload** — deep-merges `formDataPatch` into project formData |
| POST | `/api/generate-representacio-pdf` | Generate Cataluña Representació PDF (server-side) |
| POST | `/api/generate-poder-pdf` | Generate Spain Poder PDF (server-side) |

### AI extraction prompt keys (`PROMPTS` object in `server.js`)

- `dni-front`, `dni-back`, `ibi`, `electricity-bill`

---

## 8. Dashboard (Admin)

**Route:** `/dashboard`  
**Auth:** Password → `POST /api/dashboard/login` → session token stored in `sessionStorage`  
**Default password:** `eltex2025` (overridable via `DASHBOARD_PASSWORD` env var)

### Features

1. **Project table** — one row per project showing:
   - Last updated, code, customer name, assessor
   - Product type badge (Solar / Aerotermia)
   - Region (Cataluña / Madrid / Valencia / Otra)
   - Address
   - Document thumbnail previews (DNI front, DNI back, IBI, Electricity pages)
   - Signed PDF status and action buttons (view/download)
   - Status checklist (pending items)
   - Actions: "Abrir formulario", "Descargar ZIP"

2. **Signed PDF generation** (client-side)
   - View (opens in new tab) or Download as PDF
   - Re-renders signed document overlay from stored project data
   - Uses `POST /api/generate-image-pdf` to wrap JPEG in PDF

3. **Project detail panel** (`ProjectDetailPanel` component, currently defined but not wired into a view in the render)
   - Full document display with AI extraction results
   - DNI / IBI / Electricity sections
   - Signed documents status
   - Photo galleries (property photos)
   - Final signatures panel
   - ZIP download

4. **Filters & search**
   - Filter by: All / Submitted / Pending
   - Search by: name, code, phone, assessor, address

5. **CSV export** — all project data

6. **Admin document upload** (newly added endpoint, UI pending)
   - `PUT /api/project/:code/admin-formdata` accepts `formDataPatch` with dashboard auth
   - Supports deep merge: `{ dni: { front: { photo, extraction } } }`, etc.
   - Arrays (e.g. electricity pages) are replaced, not merged

### `dashboardProject.ts` — Data transformation layer

Transforms raw project data into typed dashboard display objects:
- `getDashboardProjectSummary(project)` → counts, address, location, document lists
- `DashboardDocumentItem` — present/absent flag, dataUrl, label
- `DashboardSignedPdfItem` — PDF availability, filename
- `DashboardAssetItem` — generic asset with dataUrl and mimeType

---

## 9. Completed Work (Changelog)

### March 26, 2026 (Session 6 — Bug Fixes)

- **Fixed B8/B9 — IDOR: Strip `accessToken` from public GET response:** `GET /api/project/:code` now returns `{ ...project }` without `accessToken`. The write token is only returned by `/api/lookup/phone/:phone` (requires knowing the phone number) and from the URL `?token=TOKEN` on magic links. Frontend `App.tsx` was already correctly using the URL token; no frontend change required.
- **Fixed B10 — `OPENROUTER_MODEL` env var ignored:** `server.js` line 44 changed to `process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001'`.
- **Verified B11 — Spain IVA/Poder PAGE_SIZE:** Actual file dimensions measured: `certificat-iva-10-es.png` = 2482×3509, `poder-representacio.png` = 1358×1920. Both have the same ~0.707 aspect ratio as `PAGE_SIZE {1448, 2048}`. Since `renderTemplate` draws the canvas at actual image dimensions and field coords are scaled proportionally via `scaledX/scaledY`, placement is proportionally correct. **Not a bug — no fix needed.**
- **Verified B12 — Cataluña template filenames:** Files on disk are `certificat-iva-10-cat.png` and `generalitat-declaration.png`, matching the code. Plan §6 file map was outdated. Updated §6 to reflect correct filenames.
- **Fixed B13 — User-visible error on render failure:** `RepresentationSection.handleContinue` catch block now sets `applyError` state and displays `"Error al aplicar la firma. Inténtalo de nuevo."` below nav buttons. Error is cleared on next signature change.
- **Fixed B14 — Double-click race condition:** Added `applyingRef = useRef(false)` guard; `handleContinue` now checks and sets `applyingRef.current` atomically before any async work. State `applying` is kept for UI updates only.
- **Fixed B15 — `formData: null` accepted by `/save` and `/submit`:** Both endpoints now validate `if (!formData || typeof formData !== 'object')` and return `400` with `"formData inválido."`. Also cleaned up stale `req.body.formData` references — both handlers now use destructured `const { formData } = req.body`.
- **Fixed B16 — No signature validation before submission:** `ReviewSection` now calls `hasRequiredSignatures(formData)` on render. If the user has a known location (not `other`) but has not signed, an amber warning banner is shown. Submission is still allowed (non-blocking, consistent with existing philosophy).
- **Fixed B19 — Stale closure in `ProvinceSelectionSection` auto-confirm:** Added `locationConfirmedRef` and `showManualRef` refs kept in sync with state. `useEffect` now checks refs instead of stale closure values; timer callback re-checks refs before auto-confirming. `useEffect` deps changed from `[]` to `[province]`. "Cambiar" and "Seleccionar provincia" buttons now also update `showManualRef.current`.
- **Fixed L2 — Duplicate `'valencia'` in `valenciaProvinces` array:** Removed the duplicate entry from `provinceMapping.ts`.

### March 26, 2026 (Session 5 — Deep Bug Audit)

- **No code changes this session** — full read-only analysis of all key source files
- **Identified B8/B9:** Public `GET /api/project/:code` exposes full PII + `accessToken` (write token) — IDOR with full read+write impact
- **Identified B10:** `OPENROUTER_MODEL` env var is ignored — model hardcoded as `gemini-3.1-flash-lite-preview` instead of reading from env
- **Identified B11:** Spain IVA/Poder `PAGE_SIZE` constants may not match actual template image dimensions — all text overlays may be proportionally misaligned; needs verification
- **Identified B12:** Cataluña IVA and Generalitat template filenames differ between code and plan — need to verify which is correct
- **Identified B13:** `handleContinue` in RepresentationSection swallows errors with no user feedback
- **Identified B14:** Double-click race condition on RepresentationSection continue button (async state guard)
- **Identified B15:** `/submit` and `/save` accept `formData: null` without validation
- **Identified B16:** ReviewSection does not validate signature presence before submitting
- **Identified B17:** `generateProjectCode` has a race condition under concurrent creates
- **Identified B18:** `saveDB()` concurrent write-corruption risk
- **Identified B19:** Stale closure in `ProvinceSelectionSection` auto-confirm useEffect
- **Identified B20:** `getAutoProvince` uses first page's province — wrong-page order causes incorrect region assignment
- **Identified B21:** `ensureRenderedDocuments` passes `code: 'project'` literal causing cosmetically wrong PDF filenames
- **Identified L1–L8:** TypeScript `any` prop, duplicate province array entry, always-true `canSubmit`, in-memory sessions, hardcoded Stirling URL, UX flash on phone confirm, location dual source of truth, phone normalizer edge cases

### March 26, 2026 (Session 4)

- **Fixed auto-submit bug in ReviewSection:** Removed the `useEffect` that auto-fired `submit()` 600ms after landing on the review screen (triggered every time the component mounted). Replaced with an explicit "Enviar documentación" button. Added `onBack` prop with proper routing (→ `province-selection` for `other`, → `representation` for all other locations).
- **Fixed B1/B6 — `other` province dead-end:** `hasRepresentationDone` now returns `true` for `other`; `ProvinceSelectionSection.onContinue` skips to `review` for `other`; `RepresentationSection` shows a friendly message + continue button when `docs[]` is empty; `validateRepresentation` skips signature checks for `other`
- **Fixed B2/B7 — Dashboard popup blockers:** Replaced all `window.open()` calls with anchor element click pattern (works reliably in embedded browser contexts); applies to `openDataUrlInNewTab`, `viewPDFInNewTab`, and thumbnail `onClick` in `DocumentTableCell` and `ElectricityTableCell`
- **Fixed B4 — Electricity duplicate detection:** `ElectricityCard` now checks `pages.some(p => p.photo?.preview === photo.preview)` before calling `onAddPage` — duplicate uploads silently ignored
- **Dashboard admin document upload:** `AdminUploadModal` added — upload any document type (DNI front/back, IBI, electricity page) directly from the dashboard; uses AI extraction + `PUT /api/project/:code/admin-formdata`; rendered via React `createPortal`; "Subir docs" button added to each project row's actions column

### March 26, 2026 (Session 3)

- **Signature alignment fix:** `signaturaPersonaInteressada` box restored to `[76, 1552, 575, 1685]` in Representació document (was accidentally changed)
- **Template version bumped** to `2026-03-26.3`
- **Simplified URL params:** `GET /api/project/:code` is now public (no token required); links use `/?code=CODE`
- **Province extraction enforced:** Province comes only from electricity bill (`ProvinceSelectionSection`, `signedDocumentOverlays.ts`, `server.js`)
- **Submission speed optimisation:**
  - `ensureRenderedDocuments` skips already-rendered docs (checks `templateVersion`)
  - Remaining renders are parallelised
  - Switched from PNG → JPEG (92%) for rendered documents (~5-10× size reduction)
  - `imageDataUrl` stripped from auto-save and submit payloads (dashboard re-renders on demand)
- **`crossOrigin` removed** from `loadImage` (was causing canvas taint issues; same-origin images don't need it)
- **Admin formdata endpoint added:** `PUT /api/project/:code/admin-formdata` with `deepMerge` helper

---

## 10. Known Bugs & Edge Cases

> Last audit: **2026-03-26 Session 5** — full codebase review covering `server.js`, `App.tsx`, `useFormState.ts`, `RepresentationSection.tsx`, `ReviewSection.tsx`, `ProvinceSelectionSection.tsx`, `signedDocumentOverlays.ts`, `provinceMapping.ts`, `api.ts`.

---

### Critical

| # | Bug | File | Status |
|---|-----|------|--------|
| B1 | `other` location dead-end in Representation step — `hasRepresentationDone` returns `false`; `docs[]` empty so user can't sign or continue | `App.tsx`, `RepresentationSection.tsx` | **Fixed 2026-03-26** |
| B2 | Preview (`openDataUrlInNewTab`, `viewPDFInNewTab`) blocked in embedded browser contexts — `window.open()` blocked by popup blockers | `Dashboard.tsx` | **Fixed 2026-03-26** |
| B3 | `buildSignedPdfFactory` — `imageDataUrl` always `undefined` (stripped from upload); fallback re-render adds latency | `Dashboard.tsx` | Working (acceptable) |
| **B8** | **`GET /api/project/:code` is fully public — returns entire project including base64 images, DNI number, NIF, address, and `accessToken`.** Sequential codes (`ELT20260001`, `ELT20260002`) mean any attacker can enumerate all projects and read sensitive customer PII. | `backend/server.js` line 356 | **Fixed 2026-03-26** |
| **B9** | **`accessToken` exposed in public GET response** — since `GET /api/project/:code` returns the full project object (including `project.accessToken`), an attacker who reads any project also gains its write token, enabling them to overwrite formData via `/save` and `/submit`. Combined with B8 this is a full read+write IDOR. | `backend/server.js` line 360 | **Fixed 2026-03-26** |

### Medium

| # | Bug | File | Status |
|---|-----|------|--------|
| B4 | Electricity bill duplicate page detection | `PropertyDocsSection.tsx` | **Fixed 2026-03-26** |
| B5 | Company data change clears all signed artifacts — even a typo forces full re-sign | `useFormState.ts` | Known limitation |
| B6 | `getInitialSection` returns `representation` for `other` province | `App.tsx` | **Fixed 2026-03-26** |
| B7 | `window.open()` in dashboard thumbnails | `Dashboard.tsx` | **Fixed 2026-03-26** |
| **B10** | **`OPENROUTER_MODEL` env var is ignored.** `server.js` line 44 hardcodes `'google/gemini-3.1-flash-lite-preview'` ignoring the env var. The plan says it should be read from `process.env.OPENROUTER_MODEL`. | `backend/server.js` line 44 | **Open** |
| **B11** | **`IVA_ES_PAGE_SIZE` and `PODER_ES_PAGE_SIZE` use `{width:1448, height:2048}` but the plan shows the actual template images are `1410×2100`.** Since all text/signature coordinates are scaled against `PAGE_SIZE`, a dimension mismatch causes proportionally wrong placement of all overlaid text and signatures. Actual file dimensions need to be verified and constants reconciled. | `signedDocumentOverlays.ts` lines 42, 57 | **Open — verify** |
| **B12** | **Template filenames in code don't match the file map in this plan:** `cataluna-iva` renders `/certificat-iva-10-cat.png` (code) vs `/verify_iva_es_top.png` (plan); `cataluna-generalitat` renders `/generalitat-declaration.png` (code) vs `/verify_iva_es_bottom_fixed.png` (plan). If these files don't exist on disk the render silently fails (canvas shows blank, no error to user). | `signedDocumentOverlays.ts` lines 349, 365 | **Open — verify** |
| **B13** | **`handleContinue` in `RepresentationSection` swallows rendering errors.** The `catch` block only logs to console. If `renderSignedDocumentOverlay` throws (e.g. missing template file, canvas memory limit), `setApplying(false)` is called but no user-visible error message appears — the button just stops spinning. | `RepresentationSection.tsx` line 169 | **Open** |
| **B14** | **Double-click race condition on `handleContinue`.** The `applying` guard is React state (`useState`); two rapid clicks can both pass `if (!sharedSignature \|\| applying)` before the state update from the first click is committed, firing the expensive document render twice and potentially calling `onChange` twice. A `useRef` guard would be atomic. | `RepresentationSection.tsx` line 135 | **Open** |
| **B15** | **`submitForm` / `/submit` endpoint accepts `formData: null` or malformed data.** The endpoint does `project.formData = req.body.formData` with no schema validation. A client (or attacker with the project token) can submit `{formData: null}` and erase all saved progress. | `backend/server.js` line 448 | **Open** |
| **B16** | **`ReviewSection` does not validate signatures before submitting.** `ensureRenderedDocuments` can return successfully with no rendered documents (if no signatures exist). A user can reach the review screen (e.g. via direct link to a partially complete project) and submit with zero signatures. No client-side or server-side signature presence check before submission. | `ReviewSection.tsx`, `backend/server.js` | **Open** |
| **B17** | **`generateProjectCode` race condition.** Two simultaneous `POST /api/project/create` requests could both calculate the same next code before either writes. The second write would silently overwrite the first project. | `backend/server.js` lines 339–346 | **Open (low probability)** |
| **B18** | **`db.json` concurrent write corruption.** `saveDB()` uses synchronous `fs.writeFileSync`. Two simultaneous save/submit requests that both call `saveDB()` operate on the same in-memory `database` object; the slower one wins and the faster one's changes are lost (last-write-wins). | `backend/server.js` line 70 | **Open (low probability)** |
| **B19** | **`ProvinceSelectionSection` auto-confirm `useEffect` has a stale closure.** The effect runs only on mount (`[]` deps, suppressed with `eslint-disable`). The `confirmLocation` inside it reads `locationConfirmed`, `showManual`, and `province` from the initial render snapshot. If any of these change in the 350ms window before the timer fires (e.g. user clicks "Cambiar" immediately), the auto-confirm still runs with the stale values and overrides the user's action. | `ProvinceSelectionSection.tsx` lines 50–58 | **Open** |
| **B20** | **`getAutoProvince` returns the first province found across electricity pages — page order wins.** If page 1 has a wrong/partial province (e.g. AI hallucination) and page 2 has the correct one, page 1 always wins. No priority weighting or merging. | `ProvinceSelectionSection.tsx` lines 29–35 | **Open** |
| **B21** | **`ensureRenderedDocuments` passes `code: 'project'` as a literal string** — `getSignedDocumentDefinitions({ formData: source, code: 'project' })` causes generated filenames to be `project_iva-cat.pdf` instead of the real project code. Functional rendering works but ZIP download manifest entries would have wrong filenames if this path were used for downloads. | `signedDocumentOverlays.ts` line 153 | **Open (cosmetic)** |

### Low / Technical Debt

| # | Issue | File | Details |
|---|-------|------|---------|
| S1 | IDOR on `GET /api/project/:code` | `backend/server.js` | **Now upgraded to B8/B9 (Critical)** |
| S2 | `dashboard_token` in `sessionStorage` survives browser restart | `DashboardLogin.tsx` | Low risk — cleared on tab close |
| **L1** | **`formData` prop on `RepresentationSection` typed as `any`** | `RepresentationSection.tsx` line 13 | Loses all TypeScript safety; runtime shape errors would be invisible to the compiler |
| **L2** | **`valenciaProvinces` array has duplicate `'valencia'` entry** | `provinceMapping.ts` line 50–51 | `'valencia'` appears twice. Harmless but messy; indicates copy/paste error |
| **L3** | **`canSubmit()` always returns `true`** — all `FormItem` entries have `required: false`, so the required-items filter is always empty. The prop is passed to `ReviewSection` but has no effect. | `useFormState.ts` lines 159–192 | No blocking validation at submit time |
| **L4** | **`dashboardSessions` Set is in-memory** — lost on server restart, forcing all admins to re-login | `backend/server.js` line 471 | Known limitation of file-based architecture |
| **L5** | **`Stirling PDF` service URL is hardcoded** — `STIRLING_PDF_URL` is a string literal; should be an env var for configurability | `backend/server.js` line 722 | Low risk |
| **L6** | **`handlePhoneConfirmed` always navigates to `property-docs` before smart routing corrects it** — `goTo('property-docs')` fires immediately; the `useEffect([project])` that calls `getInitialSection` fires one render later, causing a brief flash of the property-docs step before jumping to the correct section for a returning customer | `App.tsx` lines 126–132 | Minor UX flash |
| **L7** | **`formData.location` and `formData.representation.location` are a dual source of truth** — `normalizeFormData` syncs them on load but intermediate mutations may diverge. Pattern `formData.location ?? formData.representation.location` is used in 5+ places | `App.tsx`, `useFormState.ts`, `signedDocumentOverlays.ts` | Technical debt |
| **L8** | **`normalizePhone` regex edge cases** — `replace(/^(?=\d{9}$)/, '+34')` handles 9-digit strings but won't normalize 10-digit landlines with area codes (`912345678` = 9 digits starting with 9 but that's a mobile pattern in Spain; `91 234 5678` = landline that totals 9 digits after strip) | `backend/server.js` line 178 | Low risk for current use case |

---

## 11. Pending Work & TODO

### High Priority

#### ~~FIX — `other` province navigation (B1, B6)~~ ✅ DONE (2026-03-26)

**Files:** `App.tsx`, `RepresentationSection.tsx`, `useFormState.ts`

1. In `App.tsx`, update `hasRepresentationDone` to return `true` for `location === 'other'` (no docs needed = done):
   ```ts
   if (location === 'other') return true;
   ```
2. In `App.tsx`, update `ProvinceSelectionSection` `onContinue` to skip representation for `other`:
   ```tsx
   onContinue={() => {
     const loc = formData.location ?? formData.representation?.location ?? null;
     goTo(loc === 'other' ? 'review' : 'representation');
   }}
   ```
3. In `RepresentationSection.tsx`, add a guard for empty `docs[]`:
   ```tsx
   if (docs.length === 0) {
     return (
       <div>
         <p>No se requieren documentos de representación para su provincia.</p>
         <button onClick={onContinue}>Continuar →</button>
       </div>
     );
   }
   ```
4. In `useFormState.ts`, update `validateRepresentation` to not require signatures for `other`

---

#### ~~FIX — Dashboard preview (B2, B7)~~ ✅ DONE (2026-03-26)

**File:** `Dashboard.tsx`

Replace `window.open(url, '_blank')` with anchor element click (works in iframes and avoids popup blockers):

```ts
function openDataUrlInNewTab(dataUrl: string) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
```

Same change for `viewPDFInNewTab` — remove `window.open('', '_blank')` and use anchor instead.

For thumbnail `onClick` in `DocumentTableCell` and `ElectricityTableCell`, replace `window.open(item.dataUrl!)` with the same anchor pattern.

---

#### ~~FEATURE — Dashboard document upload (admin)~~ ✅ DONE (2026-03-26)

**Backend:** `PUT /api/project/:code/admin-formdata` — **already implemented**

**Frontend:** `Dashboard.tsx` — Add `AdminUploadModal` component:

```
Modal tabs:
  ├── DNI frontal     → extract as 'dni-front', patch { dni: { front: { photo, extraction } } }
  ├── DNI trasera     → extract as 'dni-back',  patch { dni: { back:  { photo, extraction } } }
  ├── IBI / Escritura → extract as 'ibi',        patch { ibi: { photo, extraction } }
  └── Factura luz     → extract as 'electricity-bill', append to electricityBill.pages[]
```

Flow per upload:
1. File input → `readFileAsDataUrl(file)` → base64 data URL
2. `POST /api/extract` with `{ imageBase64: dataUrl, documentType }`
3. Build `formDataPatch` from extraction result
4. `PUT /api/project/:code/admin-formdata` with `{ formDataPatch }` + `x-dashboard-token`
5. Call `onRefresh()` to reload dashboard data

Wire into `ProjectTableRow` actions column as "Subir docs" button.
Also update `DNIDisplay`, `IBIDisplay`, `ElectricityDisplay` to show even when no data exists (removing early `if (!asset) return null`).

---

### High Priority (New — Session 5 Audit)

#### FIX — B8/B9: IDOR — Public project endpoint exposes PII + write token

**File:** `backend/server.js` lines 356–361

**Problem:** `GET /api/project/:code` is completely unauthenticated. The response includes the full project object — customer DNI image (base64), NIF, address, signatures, and critically `project.accessToken` (the write token for `/save` and `/submit`). Project codes are sequential (`ELT20260001`) so an attacker can enumerate all projects.

**Fix (recommended — Option B, minimal change):**

Strip `accessToken` from the public GET response so it is never sent to unauthenticated callers. The frontend already captures the token from `project.accessToken` on load (App.tsx line 86–88) — instead, the token should only be returned after a phone-based lookup (which proves the caller knows the phone number) or after dashboard login.

```js
// backend/server.js — GET /api/project/:code
app.get('/api/project/:code', (req, res) => {
  const project = database.projects[req.params.code];
  if (!project) return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });
  // Strip write token from public response — never expose it unauthenticated
  const { accessToken: _omit, ...safeProject } = project;
  res.json({ success: true, project: safeProject });
});
```

The phone lookup endpoint (`/api/lookup/phone/:phone`) already proves identity and can be the only place that returns the full project with `accessToken`. The frontend then stores it in state via `handlePhoneConfirmed`.

**Also** update `fetchProject` in `api.ts` to only send the token if it is already known (it currently does this correctly at line 16). No frontend change required for this fix.

---

#### FIX — B10: `OPENROUTER_MODEL` env var ignored

**File:** `backend/server.js` line 44

**Problem:** The constant is hardcoded:
```js
const OPENROUTER_MODEL = 'google/gemini-3.1-flash-lite-preview';
```
The env var `OPENROUTER_MODEL` documented in §13 is never read.

**Fix:**
```js
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
```

---

#### FIX — B11: Verify `IVA_ES_PAGE_SIZE` and `PODER_ES_PAGE_SIZE` template dimensions

**File:** `signedDocumentOverlays.ts` lines 42–57

**Problem:** Both constants use `{ width: 1448, height: 2048 }` but this plan's §6 file map states the Spain IVA and Poder templates are `1410×2100`. All text/signature boxes are scaled proportionally to these reference dimensions. If they are wrong, all overlaid data is misaligned.

**Action:** Run the following check and update the constants if needed:
```bash
python3 -c "
from PIL import Image
for f in ['app/public/certificat-iva-10-es.png', 'app/public/poder-representacio.png']:
  img = Image.open(f)
  print(f, img.size)
"
```
Or check via Node:
```js
const { createCanvas, loadImage } = require('canvas');
loadImage('app/public/certificat-iva-10-es.png').then(img => console.log(img.width, img.height));
```

Also reconcile the §6 File Map table with actual image dimensions and update `SIGNED_DOCUMENT_TEMPLATE_VERSION` after any fix.

---

#### FIX — B12: Verify Cataluña template filenames on disk

**File:** `signedDocumentOverlays.ts` lines 349, 365

**Problem:** The renderer loads:
- `cataluna-iva` → `/certificat-iva-10-cat.png`
- `cataluna-generalitat` → `/generalitat-declaration.png`

But this plan's §6 file map lists the Cataluña IVA template as `/verify_iva_es_top.png` and the Generalitat as `/verify_iva_es_bottom_fixed.png`. One of these is wrong (either the code was updated and the plan wasn't, or the opposite).

**Action:** Check `app/public/` directory for actual filenames. If the plan is outdated, update §6 in this document. If the code is outdated, update the `renderTemplate(...)` calls.

---

#### FIX — B13: User-visible error on `handleContinue` render failure

**File:** `RepresentationSection.tsx` lines 135–174

**Problem:** If `renderSignedDocumentOverlay` throws, the catch silently logs to console and the button stops spinning with no feedback. User must guess what happened.

**Fix:** Add state for error message and display it:
```tsx
const [applyError, setApplyError] = useState<string | null>(null);

// In handleContinue catch:
} catch (err) {
  console.error('Failed to apply signatures:', err);
  setApplyError('Error al aplicar la firma. Inténtalo de nuevo.');
} finally {
  setApplying(false);
}

// In render, below the nav buttons:
{applyError && (
  <p className="text-sm text-red-600 text-center">{applyError}</p>
)}
```
Clear `applyError` on the next signature pad change.

---

#### FIX — B14: Double-click guard for `handleContinue`

**File:** `RepresentationSection.tsx` line 135

**Problem:** `applying` state guard is async; two rapid clicks can both pass before the first state update commits.

**Fix:** Replace the state guard with a ref:
```tsx
const applyingRef = useRef(false);

const handleContinue = async () => {
  if (!sharedSignature || applyingRef.current) return;
  applyingRef.current = true;
  setApplying(true);
  try {
    // ... existing logic
  } finally {
    applyingRef.current = false;
    setApplying(false);
  }
};
```

---

#### FIX — B15: Validate `formData` shape on `/submit` endpoint

**File:** `backend/server.js` line 438–460

**Problem:** `project.formData = req.body.formData` with no validation. A `formData: null` payload erases all data.

**Fix:** Add null/type guard:
```js
app.post('/api/project/:code/submit', requireProjectToken, (req, res) => {
  const { formData, source } = req.body;
  if (!formData || typeof formData !== 'object') {
    return res.status(400).json({ success: false, message: 'formData inválido.' });
  }
  // ... rest of handler
});
```
Apply the same guard to `/save`.

---

#### FIX — B19: Stale closure in `ProvinceSelectionSection` auto-confirm `useEffect`

**File:** `ProvinceSelectionSection.tsx` lines 50–58

**Problem:** The effect has empty deps (`[]`) via `eslint-disable`. The 350ms timer's callback reads `locationConfirmed`, `showManual`, and the `confirmLocation` closure from mount — if the user clicks "Cambiar" in under 350ms, the auto-confirm fires anyway.

**Fix:** Either (a) use a ref for the cancellation flag that the "Cambiar" button sets, or (b) include the actual reactive values in deps and guard correctly:
```tsx
useEffect(() => {
  if (locationConfirmed || showManual || !province) return;
  const locInfo = getLocationInfo(province);
  if (locInfo.id === 'other') return;
  const timer = setTimeout(() => {
    // Re-read current state from refs to avoid stale closure
    if (!locationConfirmedRef.current && !showManualRef.current) {
      confirmLocation(locInfo.id);
    }
  }, 350);
  return () => clearTimeout(timer);
}, [province]); // Only depend on province
```

---

### Medium Priority (New — Session 5 Audit)

#### FIX — B16: Add signature presence check before review submission

**File:** `ReviewSection.tsx`, `backend/server.js`

**Problem:** A user who has no signed documents (or navigates directly to review) can submit with zero signatures. No validation catches this.

**Options:**
- **Client-side:** In `ReviewSection`, before calling `submit()`, check `hasRepresentationDone(formData, location)` and warn or block if false.
- **Server-side:** On `/submit`, check that `formData.representation` contains at least one signature for the project's location.

Recommended: add a client-side warning (not a hard block — in line with current "you can submit with missing docs" philosophy) and a server-side log.

---

#### FIX — L2: Remove duplicate `'valencia'` entry in `provinceMapping.ts`

**File:** `provinceMapping.ts` line 50–51

```ts
// Before:
const valenciaProvinces = [
  'valencia',
  'valencia', // Valencia/València   ← remove duplicate
  'alicante',
  ...
```

---

### Medium Priority

#### ~~FIX — Electricity duplicate detection~~ ✅ DONE (2026-03-26)

**File:** `PropertyDocsSection.tsx`

Before calling `addElectricityPage`, compare the new image's base64 preview against existing pages:
```ts
const isDuplicate = formData.electricityBill.pages.some(
  p => p.photo?.preview === newPhoto.preview
);
if (!isDuplicate) addElectricityPage(newPhoto, extraction);
```

---

#### FEATURE — Property photos sections (Solar vs Aerothermal)

Types are defined (`RoofData`, `ElectricalPanelData`, `InstallationSpaceData`, `RadiatorsData`) but these sections are **not wired into the main form flow** in `App.tsx`.

- Solar installs need: `electricalPanel`, `roof`
- Aerothermal installs need: `electricalPanel`, `installationSpace`, `radiators`
- `PropertyPhotosSection.tsx` exists but is not yet activated in the routing

**To activate:**
1. Add `'property-photos'` to the `Section` union type in `types/index.ts`
2. Add the section step between property-docs and province-selection in `App.tsx`
3. Wire `onBack`/`onContinue` accordingly
4. Show section in `ReviewSection` checklist

---

#### FIX — Security: IDOR on public project endpoint

**File:** `backend/server.js`

Option A (minimal): Add a `?token=ACCESSTOKEN` check on `GET /api/project/:code` if a token is present in the query.  
Option B (recommended): Add a non-sequential secondary read token (UUID) stored per project and required for reading. Links become `/?code=CODE&rt=READTOKEN`.

---

### Low Priority

#### Dashboard detail panel integration

`ProjectDetailPanel` component is fully defined but **not rendered** in the current dashboard layout (only the table rows are shown). Consider making table rows expandable to show the detail panel below.

#### Parallel extraction for multi-page electricity bills

Currently each electricity page is extracted sequentially. Could use `POST /api/extract-batch` to extract all pages in parallel.

#### PDF to images improvement

`pdfToImages.ts` uses `pdfjs-dist` to convert PDF uploads to images client-side. The rendering quality and page count handling could be improved.

---

## 12. File Map

```
app/src/
├── App.tsx                           Main router, section switching, hasRepresentationDone
├── config/
│   └── documentSpec.ts               Document specs: templates, field coords, signature boxes
├── hooks/
│   ├── useFormState.ts               Core state machine (all setters, validators, auto-save)
│   ├── useProject.ts                 Project fetch hook
│   └── useUrlParams.ts               URL search params helper
├── lib/
│   ├── dashboardProject.ts           Transforms project data for dashboard display
│   ├── photoValidation.ts            Client-side image resolution/size validation
│   ├── provinceMapping.ts            Province string → LocationRegion mapping
│   ├── signedDocumentOverlays.ts     Canvas-based document rendering (browser)
│   ├── pdfToImages.ts                PDF → images conversion (pdfjs-dist)
│   └── utils.ts                      Shared utilities (cn, etc.)
├── pages/
│   ├── Dashboard.tsx                 Admin dashboard (1300+ lines)
│   └── DashboardLogin.tsx            Admin login page
├── sections/
│   ├── ErrorSection.tsx              Error display
│   ├── LoadingSection.tsx            Loading spinner
│   ├── PhoneSection.tsx              Phone lookup step
│   ├── PropertyDocsSection.tsx       Document upload + AI extraction (900 lines)
│   ├── PropertyPhotosSection.tsx     Property photo capture (not yet wired to main flow)
│   ├── ProvinceSelectionSection.tsx  Location selection + company data
│   ├── RepresentationSection.tsx     Document signing carousel
│   ├── ReviewSection.tsx             Pre-submission checklist
│   ├── SignaturesSection.tsx         Final customer/rep signatures
│   ├── SuccessSection.tsx            Submission confirmation
│   └── WelcomeSection.tsx            Landing/welcome screen
├── services/
│   └── api.ts                        All fetch helpers (fetchProject, saveProgress, etc.)
├── types/
│   └── index.ts                      All TypeScript types
└── components/
    ├── PDFViewer.tsx                  Inline PDF viewer component
    ├── PhotoUpload.tsx                Reusable photo upload widget
    └── SignaturePad.tsx               Signature drawing component

backend/
└── server.js                         Express server (1520+ lines)
    ├── Middleware: cors, multer, auth
    ├── DB helpers: loadDB, saveDB, buildDashboardSummary, checkCataloniaPDFs
    ├── AI: PROMPTS dict, extraction routes, deepMerge helper
    └── PDF: generate-representacio-pdf, generate-poder-pdf, generate-image-pdf

public/
├── eltex-logo.png
├── verify_iva_es_top.png             Cataluña IVA template
├── verify_iva_es_bottom_fixed.png    Cataluña Generalitat template
├── autoritzacio-representacio.jpg    Cataluña Representació template
├── certificat-iva-10-es.png          Spain IVA template
└── poder-representacio.png           Spain Poder template
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | — | OpenRouter API key for Gemini extraction |
| `OPENROUTER_MODEL` | No | `google/gemini-2.0-flash-001` | Model to use for extraction |
| `DASHBOARD_PASSWORD` | No | `eltex2025` | Admin dashboard password |
| `PORT` | No | `3001` | Backend server port |

---

*End of implementation plan.*
