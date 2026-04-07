# Eltex Document Collection Form — Product Requirements Document

## Overview

Eltex is a Spanish solar and aerothermal installation company. This web application is a mobile-first multi-step form that guides customers through submitting the required documentation and signed legal authorizations needed to proceed with their installation project.

## User Roles

### Customer
- Accesses the app via a unique project URL: `/?code=ELTXXXXXX`
- No login required — the project code in the URL is their identifier
- Completes the form on their mobile device

### Assessor (Admin)
- Accesses the admin dashboard at `/dashboard`
- Authenticates with password `eltex2025`
- Reviews submitted projects, views uploaded documents, and downloads project ZIP archives

## Customer Flow (Steps)

### Step 1: Phone Number Entry
- URL: `/?` (no code)
- Customer enters their Spanish phone number
- System looks up their project by phone number
- On success, redirects to `/?code=ELTXXXXXX`

### Step 2: Property Documents (`/property-docs`)
- Customer uploads:
  - **DNI/NIE identity document**: front photo required; back required if DNI card front only (not required for NIE certificate/card or combined-image DNI)
  - **IBI certificate**: photo or PDF upload
  - **Electricity bill**: one or more pages, photo or PDF
  - **CUPS contract** (optional): PDF upload
- Each document is processed by AI (OCR) to extract data automatically
- User can review and confirm extracted data

### Step 3: Province Selection (`/province-selection`)
- Customer selects their region/province
- Determines which legal signing documents are required:
  - **Cataluña**: 3 documents to sign (autorització, generalitat, IVA Catalunya)
  - **Madrid / Valencia**: 2 documents to sign (IVA España, poder representació)
  - **Other provinces**: no signing required

### Step 4: Representation / Legal Signing (`/representation`)
- Customer signs legal authorization PDFs on a signature pad
- Number of signatures depends on province (see Step 3)
- Signatures are overlaid onto PDF templates
- Skipped entirely for "other" provinces

### Step 5: Energy Certificate Survey (`/energy-certificate`)
- 4-step survey collecting technical housing data:
  1. **Housing data**: cadastral reference, area (m²), floor count, ceiling height, bedroom count
  2. **Openings**: doors and windows by orientation (N/E/S/W), frame material, glass type, shutters
  3. **Thermal systems**: water heater type, boiler fuel, air conditioning, heating emitter type
  4. **Additional info**: product sold (solar panels, aerothermal, both), existing customer status
- Customer signs the completed certificate
- Can be skipped (assessor may complete it later)

### Step 6: Review & Submit (`/review`)
- Checklist showing completion status of all required items
- Customer can go back and fix any incomplete items
- Submit button sends all data to Eltex

### Step 7: Success
- Confirmation screen shown after successful submission

## Smart Routing

The app determines the correct starting step based on existing form data:
- If representation is complete → skip to energy certificate or review
- If property docs are complete → go to province selection
- If province is set → go to representation
- Partial sessions are restored from localStorage/IndexedDB on reload

## DNI/NIE Document Rules

| Document Type | Back Required? |
|---|---|
| DNI card (front only) | Yes — back must be uploaded |
| DNI card (AI detects combined front+back) | No |
| NIE certificate | No |
| NIE card | No |

## Province → Signing Flow

| Province | Documents to Sign |
|---|---|
| Cataluña | autorització + generalitat + IVA Catalunya (3 signatures) |
| Madrid | IVA España + poder representació (2 signatures) |
| Valencia | IVA España + poder representació (2 signatures) |
| Other | None (skip signing section) |

## Admin Dashboard

- Protected by password: `eltex2025`
- Lists all submitted projects with customer name, phone, product type, assessor
- Click a project to view details: uploaded documents, extracted data, signatures
- Download complete project as ZIP archive
- Export projects list as CSV

## API Endpoints

- `GET /api/projects/:code` — Load project by code
- `POST /api/projects/:code/submit` — Submit completed form
- `POST /api/upload` — Upload document (photo or PDF)
- `POST /api/extract/dni` — AI extraction for DNI/NIE
- `POST /api/extract/ibi` — AI extraction for IBI certificate  
- `POST /api/extract/electricity-bill` — AI extraction for electricity bill
- `POST /api/extract/contract` — AI extraction for CUPS contract
- `GET /api/dashboard/projects` — List all projects (admin)
- `GET /api/dashboard/projects/:code` — Get single project details (admin)
- `GET /api/dashboard/projects/:code/download` — Download project ZIP (admin)
- `GET /health` — Health check

## Test Projects

| Code | Product Type | Notes |
|---|---|---|
| ELT20250001 | solar | Standard solar project |
| ELT20250002 | aerothermal | Aerothermal-only project |
| ELT20250003 | solar | Additional solar project |
| ELT20250004 | solar-ec | Solar with energy certificate flow |
| ELT20250005 | ec-flow | Energy certificate flow test |

## Technical Stack

- **Frontend**: React 19 + TypeScript + Vite, port 5000
- **Backend**: Node.js + Express, port 3001, flat-file JSON database
- **AI**: OpenRouter API (Gemini Flash) for document OCR
- **Image processing**: Python/Flask autocropper service for document boundary detection
- **PDF generation**: pdf-lib for stamping signatures onto legal PDFs
- **Offline support**: localStorage + IndexedDB for session resilience

## Key Acceptance Criteria

1. Customer can complete the full flow from phone entry to success screen
2. DNI back-side upload is required for card-front-only uploads, not for NIE or combined images
3. Province selection correctly determines which legal documents to sign
4. Signatures are correctly applied to the appropriate PDF templates
5. Admin dashboard shows submitted projects and allows ZIP download
6. Sessions are recoverable after browser reload via local backup
7. App correctly routes returning users to their last saved step
