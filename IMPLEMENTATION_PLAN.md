# Eltex Digital Onboarding — Implementation Plan & Technical Reference

> **Last updated:** March 26, 2026  
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

**Dev routing:** Frontend runs at `:5173`, proxied through Express at `:3001`. All API calls use relative paths (`/api/…`). The Replit preview iframe hits `:3001`.

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

### March 26, 2026 (Session 4)

- **Fixed B1/B6 — `other` province dead-end:** `hasRepresentationDone` now returns `true` for `other`; `ProvinceSelectionSection.onContinue` skips to `review` for `other`; `RepresentationSection` shows a friendly message + continue button when `docs[]` is empty; `validateRepresentation` skips signature checks for `other`
- **Fixed B2/B7 — Dashboard popup blockers:** Replaced all `window.open()` calls with anchor element click pattern (works in Replit iframes); applies to `openDataUrlInNewTab`, `viewPDFInNewTab`, and thumbnail `onClick` in `DocumentTableCell` and `ElectricityTableCell`
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

### Critical

| # | Bug | File | Status |
|---|-----|------|--------|
| B1 | `other` location creates dead-end in Representation step — `hasRepresentationDone` returns `false` for `other`; `docs[]` is empty so user can't sign or continue | `App.tsx`, `RepresentationSection.tsx` | **Fixed 2026-03-26** |
| B2 | Preview (`openDataUrlInNewTab`, `viewPDFInNewTab`) blocked in Replit iframe — uses `window.open()` which is blocked by popup blockers | `Dashboard.tsx` | **Fixed 2026-03-26** |
| B3 | `buildSignedPdfFactory` — `imageDataUrl` is now always `undefined` (stripped from upload); relies entirely on `renderSignedDocumentOverlay` fallback | `Dashboard.tsx` | Working (fallback works, but adds latency) |

### Medium

| # | Bug | File | Status |
|---|-----|------|--------|
| B4 | Electricity bill pages: no duplicate detection — user can upload the same page multiple times | `PropertyDocsSection.tsx` | **Fixed 2026-03-26** |
| B5 | Company data change clears ALL signed artifacts — even fixing a typo forces full re-sign | `useFormState.ts` | Known limitation |
| B6 | `getInitialSection` returns `representation` for `other` province — user is sent to Representation but no docs exist | `App.tsx` | **Fixed 2026-03-26** |
| B7 | `DocumentTableCell` and `ElectricityTableCell` use `window.open()` for thumbnail preview — same popup blocker issue | `Dashboard.tsx` | **Fixed 2026-03-26** |

### Low / Security

| # | Issue | Details |
|---|-------|---------|
| S1 | IDOR risk: project codes are sequential (`ELT20250001`, `ELT20250002`) — anyone who guesses a code can read the full formData (DNI, name, address) via public `GET /api/project/:code` | Consider adding a read token or making the endpoint require dashboard auth |
| S2 | `dashboard_token` stored in `sessionStorage` — cleared on tab close, but not on browser close if session survives |

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
