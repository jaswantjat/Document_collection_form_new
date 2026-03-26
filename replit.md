# Eltex Document Collection Form

A web application for collecting and processing documents for solar installations. It supports region-specific workflows (Catalonia, Madrid, Valencia) and uses AI to extract data from uploaded documents.

## Architecture

- **Frontend** (`app/`): React 19 + TypeScript + Vite + Tailwind CSS + Radix UI (Shadcn-style). Runs on port 5000.
- **Backend** (`backend/`): Node.js + Express. Runs on port 3001. Handles API routes for project management, AI extraction (OpenRouter/Gemini), and PDF generation.
- **Scripts** (`scripts/`): Python utilities for stamping digital signatures onto PDFs.

## Running the App

Two workflows are configured:
1. **Backend** — `cd backend && node server.js` (port 3001, console)
2. **Start application** — `cd app && npm run dev` (port 5000, webview)

The Vite dev server proxies `/api` requests to the backend at `http://localhost:3001`.

## Key Configuration

- Backend reads `.env` for `OPENROUTER_API_KEY` (required for AI document extraction).
- Data is stored in `backend/db.json` (file-based JSON persistence).
- Uploaded files go to `backend/uploads/`.

## Environment Variables

- `OPENROUTER_API_KEY` — Required for AI extraction features (OpenRouter API key for Gemini 2.0 Flash).
- `STIRLING_PDF_API_KEY` — Required for PDF-to-image conversion (Stirling-PDF hosted API at `s-pdf-production-ed78.up.railway.app`). Sent as `X-API-KEY` header.

## PDF Conversion

PDFs uploaded in the electricity bill section are converted server-side via the Stirling-PDF API:
1. Frontend POSTs the PDF file to `/api/pdf-to-images` on the backend.
2. Backend calls Stirling-PDF (`/api/v1/convert/pdf/img`) with `imageFormat=png`, `singleImage=false`, `dpi=150`.
3. Stirling-PDF returns a ZIP file; the backend extracts the PNG images, sorts them by page order, and returns them as base64 strings.
4. Frontend converts each base64 string to a `File` object and processes them through the normal validation + AI extraction pipeline.

Error handling covers: API unavailability, password-protected PDFs, empty ZIP, and parse failures — all surface a dismissable error banner to the user.

## Test Data

Default projects seeded in db.json:
- `ELT20250001` — María García López (solar)
- `ELT20250002` — Juan Pérez Martínez (aerothermal)
- `ELT20250003` — Laura Fernández Ruiz (solar)

## Changes (2026-03-26, Session 3)

### Speed & UX Improvements
- **Batch AI extraction**: Electricity bill pages now sent in ONE AI call (all images bundled) instead of one call per image → faster extraction. New `/api/extract-batch` backend endpoint.
- **Image compression**: All images compressed to max 1600px / JPEG 82% before sending to AI — 10-20× smaller payload, much faster upload.
- **IBI PDF upload**: DocCard now accepts PDFs — converts first page via Stirling-PDF then extracts as normal.
- **Province auto-confirm**: When province is detected from electricity bill and maps to a known region, the province-selection screen auto-confirms with a 350ms animation — no button click needed.
- **Minimal success screen**: SuccessSection redesigned as a warm, minimal thank-you message ("Gracias, [nombre].") with smooth fade-in. No buttons.
- **Frictionless resume**: When reopening the link with docs already uploaded, completed docs appear as compact green rows (tap to expand). Only missing docs show full upload cards. Title adapts to show "Faltan X documentos".
- **Cross-document validation**: Name mismatch between DNI and electricity bill `titular` triggers an amber warning banner in PropertyDocsSection.

## Changes (2026-03-25, Session 2)

### UI: Carousel + Single Signature
- `RepresentationSection` redesigned to show all regional documents in a horizontal swipeable carousel on a single screen
- One shared `SignaturePad` below the carousel — the user signs once and the signature is applied to all documents simultaneously
- Documents render previews (without signature) for review before signing
- Carousel has navigation arrows, dot indicators, and shows document count (e.g. "1 de 3")

### Signature Mapping Fix
- `drawSignature()` and `drawPercentSignature()` in `signedDocumentOverlays.ts` now paint a white rectangle over the sign-here area before drawing the actual signature, preventing overlap with any template indicator
- Template version bumped to `2026-03-25.3`

### Smart Edit-Link Routing
- `App.tsx` uses `getInitialSection()` to determine the first incomplete step when a project loads via URL code
- Routing order: if representation is done → go to review; if location set → go to representation; if docs done → go to province-selection; otherwise → property-docs

### Review Section
- Shows only pending (incomplete) checklist items when some are incomplete
- Shows all items only when everything is complete — keeping the interface clean when returning via edit link
- Passes `projectToken` to `submitForm` for IDOR-protected submission

### IDOR Security (Insecure Direct Object Reference)
- All projects now get a UUID `accessToken` on creation
- Existing projects in `db.json` get tokens auto-assigned on server startup
- `GET /api/project/:code`, `POST /api/project/:code/save`, and `POST /api/project/:code/submit` all require `x-project-token` header to match the stored token
- Dashboard endpoints bypass project token check (they use dashboard auth instead)
- Phone lookup returns project including `accessToken` so the frontend can build the full URL
- Edit links now include `?code=...&token=...` format
- On startup, the server prints access URLs for test projects (code + token)

## Document Overlay Fixes (2026-03-25)

All 5 document types have been analyzed and corrected:
- **Autorització de Representació** (Catalunya): Correct — 1241×1754px, box-based coords
- **Generalitat** (Catalunya): Correct — 1357×1920px, box-based coords
- **Certificat IVA 10%** (Catalunya): Correct — uses %-based positioning on `certificat-iva-10-cat.png`
- **Certificat IVA 10%** (España): Fixed — was referencing a non-existent filename; y-coordinates shifted up ~26px (ref space) so text sits ON form underlines instead of below them; now uses `certificat-iva-10-es.png`
- **Poder/Autorització de Representació** (España): Fixed — was referencing a non-existent filename; now uses `poder-representacio.png`; template also had a baked-in date "23/03/2026" which was erased

Template version bumped to `2026-03-25.2` to invalidate cached renders.

## Deployment

Configured as a VM deployment (always running, due to file-based state):
- Build: `cd app && npm run build`
- Run: `cd backend && node server.js`
