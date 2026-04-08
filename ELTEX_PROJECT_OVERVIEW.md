# Eltex Document Collection Form — Project Overview

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [User Roles](#4-user-roles)
5. [Product Requirements](#5-product-requirements)
6. [User Stories](#6-user-stories)
7. [API Reference](#7-api-reference)
8. [Data Model](#8-data-model)
9. [Webhook Integration](#9-webhook-integration)
10. [Scrum Methodology](#10-scrum-methodology)
11. [Sprint History & Backlog](#11-sprint-history--backlog)
12. [Deployment & Infrastructure](#12-deployment--infrastructure)
13. [Security](#13-security)
14. [Testing](#14-testing)

---

## 1. Project Summary

**Client:** Eltex — Spanish solar and aerothermal installation company  
**Product:** Mobile-first multi-step web application for customer document collection  
**Live URL:** https://documentos.eltex.es  
**Repository:** https://github.com/jaswantjat/Document_collection_form_new

### What it does

When Eltex sells a solar panel or aerothermal installation to a customer, they need the customer to submit several legal documents (ID card, property records, electricity bill) and sign legal authorization PDFs before the installation can proceed.

This app replaces a paper/WhatsApp-based process with a guided digital flow that:
- Automatically extracts data from documents using AI (OCR)
- Adapts the signing requirements by region (Cataluña vs. Madrid/Valencia vs. other)
- Stores everything in a project archive the sales team can download
- Notifies the CRM (DocFlow) via webhook on submission

---

## 2. Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 19.2 | UI framework |
| TypeScript | 5.9 | Type safety |
| Vite | 7.2 | Build tool & dev server (port 5000) |
| Tailwind CSS | 3.4 | Utility-first styling |
| Radix UI / shadcn | Latest | Accessible component primitives |
| React Router DOM | 7.13 | Client-side routing |
| React Hook Form | 7.70 | Form state management |
| Zod | 4.3 | Schema validation |
| GSAP | 3.14 | Animations |
| react-signature-canvas | 1.1-alpha | Signature pad |
| pdfjs-dist | 5.5 | PDF rendering in browser |
| Lucide React | 0.562 | Icons |
| Vitest | 4.1 | Unit testing |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| Express | 4.18 | HTTP server (port 3001) |
| pdf-lib | 1.17 | PDF manipulation & signature stamping |
| multer | 1.4 | File upload handling |
| AdmZip | 0.5 | ZIP archive generation |
| helmet | 8.1 | HTTP security headers |
| express-rate-limit | 8.3 | Rate limiting |
| compression | 1.8 | Gzip response compression |
| dotenv | 17.3 | Environment variable loading |
| uuid | 9.0 | Access token generation |

### Image Processing

| Technology | Purpose |
|---|---|
| Python 3 / Flask | Autocropper microservice |
| OpenCV | Document boundary detection, perspective correction |
| Pillow | Image conversion and PDF generation |

### AI / External APIs

| Service | Purpose |
|---|---|
| OpenRouter API (Gemini Flash) | OCR: extracts data from DNI, IBI, electricity bill, contracts |
| DocFlow Webhook | CRM notification on new orders and document updates |

### Data Storage

| Layer | Technology |
|---|---|
| Server-side database | Flat-file JSON (`db.json`) on Railway volume at `/data` |
| File uploads | Local filesystem at `/data/uploads/` |
| Client-side session | `localStorage` + `IndexedDB` (offline resilience) |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Customer Device                   │
│  React SPA (Vite, port 5000)                          │
│  ├── localStorage  (session state, small data)        │
│  └── IndexedDB     (binary photos, offline backup)   │
└─────────────────────┬────────────────────────────────┘
                      │ HTTP (proxied in dev)
┌─────────────────────▼────────────────────────────────┐
│              Node.js / Express API (port 3001)        │
│  ├── /api/project/*      Project CRUD                 │
│  ├── /api/extract/*      AI document extraction       │
│  ├── /api/dashboard/*    Admin endpoints              │
│  ├── /api/autocrop/*     Proxy to autocropper         │
│  └── db.json + /data/uploads   Persistent storage     │
└────────┬────────────────────────┬────────────────────┘
         │                        │
┌────────▼──────┐      ┌──────────▼─────────────────┐
│ OpenRouter AI │      │ Autocropper (Python/Flask)  │
│ (Gemini Flash)│      │ OpenCV document cropping    │
└───────────────┘      └────────────────────────────┘
         │
┌────────▼──────────────┐
│  DocFlow Webhook      │
│  (CRM / new_order,    │
│   doc_update events)  │
└───────────────────────┘
```

### Deployment (Production)

```
GitHub (main branch)
    │  auto-deploys on push
    ▼
Railway (europe-west4 region)
    ├── Service: DOCUMENT-COLLECTION-FORM  (Node.js, Nixpacks)
    │   Volume: /data (persistent db.json + uploads)
    └── Service: autocropper               (Python/Flask)

Custom domain: documentos.eltex.es
```

---

## 4. User Roles

### Customer
- Receives a unique project URL: `/?code=ELTXXXXXX`
- No login required — the project code is their session token
- Completes the form on mobile (mobile-first design)
- Can return later and resume from their last incomplete step

### Assessor (Sales Agent)
- Creates new projects by entering a customer's phone number at `/?`
- **Name is required** when creating a project — stored and sent to CRM
- Accesses the admin dashboard at `/dashboard`
- Authenticates with a shared password
- Reviews submissions, views extracted data, downloads project ZIPs

---

## 5. Product Requirements

### REQ-01 — Phone-based Project Lookup
The system shall look up an existing project by phone number. If found, the customer is routed to their last incomplete step. If not found, the assessor creates a new project.

### REQ-02 — Assessor Name Mandatory
When creating a new project, the assessor's full name is **required**. It is stored on the project and included in all webhook notifications to the CRM. The system rejects project creation if the assessor name is blank (validated on both frontend and backend).

### REQ-03 — Document Upload with AI Extraction
The system shall accept photo and PDF uploads for:
- DNI / NIE identity document (front, and back if required)
- IBI property certificate
- Electricity bill (one or more pages)
- CUPS contract (optional)

Each upload triggers AI extraction (OCR via Gemini Flash) and presents the extracted fields for review.

### REQ-04 — DNI Back-Side Intelligence
| Document Type | Back Required |
|---|---|
| Spanish DNI card (front-only image) | Yes |
| Spanish DNI card (combined front+back image) | No |
| NIE certificate | No |
| NIE card | No |
| Passport | No |

### REQ-05 — Region-Based Signing Flow
Province selection determines which legal documents the customer must sign:
| Region | Documents |
|---|---|
| Cataluña | Autorització + Generalitat + IVA Catalunya (3 signatures) |
| Madrid / Valencia | IVA España + Poder de representació (2 signatures) |
| Other provinces | No signing required |

### REQ-06 — Signature Stamping
Signatures drawn on the signature pad are embedded into the correct legal PDF templates using `pdf-lib`. The stamped PDFs are stored per project.

### REQ-07 — Energy Certificate Survey
A 4-step technical survey collects housing data (area, openings, thermal systems) required to generate an energy performance certificate. Can be skipped and completed later by the assessor.

### REQ-08 — Smart Routing
Returning users land directly on their last incomplete step. The routing engine checks formData completeness to determine where to start.

### REQ-09 — Offline Resilience
Form state is backed up to `localStorage` and `IndexedDB` continuously. On browser reload or network drop, the session is automatically restored.

### REQ-10 — Admin Dashboard
- Lists all projects with: customer name, phone, product type, assessor, region, document status
- Single unified "DNI / NIE" column (front + back treated as one document)
- Status column lists which documents are still pending per project
- Per-project detail view with all uploaded images and extracted data
- Download full project as ZIP archive
- Export all projects as CSV

### REQ-11 — Webhook Notifications
On first form submission, the system fires a `new_order` event to DocFlow containing: order ID, customer name, first/last name, phone, locale, product type, contract date, **assessor name**, and uploaded docs list.

On follow-up document uploads, a `doc_update` event is fired with the updated docs list.

---

## 6. User Stories

### As a customer:
- **US-01** — I can enter my phone number and be found by the system, so I don't need to remember a code.
- **US-02** — I can upload a photo of my DNI with my phone camera, so I don't need to scan it.
- **US-03** — I can see that my documents were understood correctly (AI extraction preview) before submitting.
- **US-04** — I can sign legal documents directly on my phone screen, so I don't need to print anything.
- **US-05** — If I close the app and come back later, I can resume from where I left off.
- **US-06** — I can complete the full process in my language (Spanish/Catalan locale detected automatically).

### As an assessor:
- **US-07** — I can create a new project for a customer by entering their phone number and my name, so it's tracked to me.
- **US-08** — I can log into the dashboard and see all submitted projects.
- **US-09** — I can see which documents each customer has uploaded and which are still pending.
- **US-10** — I can download all documents for a project as a single ZIP archive.
- **US-11** — I can manually upload a document for a customer from the dashboard.
- **US-12** — I am notified (via CRM) automatically when a customer completes their submission.

---

## 7. API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/project/:code` | Access token | Load project by code |
| `GET` | `/api/project/phone/:phone` | None | Look up project by phone |
| `POST` | `/api/project/create` | None | Create new project (assessor required) |
| `POST` | `/api/project/:code/save` | Access token | Auto-save form progress |
| `POST` | `/api/project/:code/submit` | Access token | Final submission |
| `POST` | `/api/extract/dni` | Access token | AI extract DNI/NIE data |
| `POST` | `/api/extract/ibi` | Access token | AI extract IBI data |
| `POST` | `/api/extract/electricity-bill` | Access token | AI extract electricity bill |
| `POST` | `/api/extract/contract` | Access token | AI extract CUPS contract |
| `POST` | `/api/autocrop` | Access token | Document boundary detection |
| `POST` | `/api/dashboard/login` | None | Dashboard password auth |
| `GET` | `/api/dashboard/projects` | Dashboard token | List all projects |
| `GET` | `/api/dashboard/projects/:code` | Dashboard token | Get project detail |
| `GET` | `/api/dashboard/projects/:code/download` | Dashboard token | Download project ZIP |
| `GET` | `/api/dashboard/csv` | Dashboard token | Export projects as CSV |
| `GET` | `/health` | None | Health check |

---

## 8. Data Model

### Project Object

```json
{
  "code": "ELT20250042",
  "accessToken": "uuid-v4",
  "customerName": "Ana García",
  "phone": "+34612345678",
  "email": "ana@example.com",
  "productType": "solar",
  "assessor": "Carlos Ruiz",
  "assessorId": "Carlos Ruiz",
  "createdAt": "2025-04-08T10:00:00.000Z",
  "lastActivity": "2025-04-08T12:00:00.000Z",
  "customerLanguage": "es",
  "submissionCount": 1,
  "formData": {
    "browserLanguage": "es",
    "dni": {
      "front": { "photo": { "preview": "base64..." }, "extraction": { "extractedData": { "fullName": "...", "dniNumber": "..." } } },
      "back": { "photo": { "preview": "base64..." }, "extraction": { "extractedData": { "address": "..." } } }
    },
    "ibi": { "pages": [], "extraction": {} },
    "electricityBill": { "pages": [] },
    "representation": {
      "location": "cataluna",
      "autoritzacioSignature": "base64...",
      "poderRepresentacioSignature": "base64..."
    },
    "energyCertificate": {}
  },
  "assetFiles": {
    "dniFront": "/uploads/assets/ELT20250042/dniFront.jpg",
    "dniBack": "/uploads/assets/ELT20250042/dniBack.jpg"
  },
  "submissions": []
}
```

---

## 9. Webhook Integration

### `new_order` Event (fired on first submission)

```json
{
  "type": "new_order",
  "order_id": "ELT20250042",
  "customer_name": "Ana García",
  "first_name": "Ana",
  "last_name": "García",
  "phone": "+34612345678",
  "locale": "es",
  "product_type": "solar",
  "contract_date": "2025-04-08",
  "assessor": "Carlos Ruiz",
  "docs_required": ["dni", "ibi", "electricity-bill"],
  "docs_uploaded": ["dniFront", "dniBack", "ibi_0", "electricity_0"]
}
```

### `doc_update` Event (fired on follow-up uploads)

```json
{
  "type": "doc_update",
  "order_id": "ELT20250042",
  "docs_uploaded": ["dniFront", "dniBack", "ibi_0"]
}
```

**Header:** `X-Eltex-Webhook-Secret: <secret>`  
**Endpoint:** `ELTEX_DOCFLOW_WEBHOOK_URL` environment variable  
**Timeout:** 5 seconds

---

## 10. Scrum Methodology

### Team Structure

| Role | Responsibility |
|---|---|
| Product Owner | Eltex business stakeholders — define priorities |
| Scrum Master / Tech Lead | Facilitates ceremonies, removes blockers |
| Developer(s) | Design, build, deploy, test |

### Sprint Configuration

- **Sprint length:** 1 week
- **Planning:** Monday — review backlog, define sprint goal, estimate tasks
- **Daily standup:** 15 min — what was done, what's next, any blockers
- **Sprint review:** Friday — demo working software to stakeholders
- **Retrospective:** Friday after review — what went well, what to improve

### Definition of Done

A feature is "done" when:
- [ ] Functionality works end-to-end in the browser
- [ ] TypeScript compiles with zero errors
- [ ] Production build succeeds (`npm run build`)
- [ ] Code is pushed to `main` on GitHub
- [ ] Railway deployment reports `SUCCESS`
- [ ] No regressions in existing flows

### Backlog Prioritisation (MoSCoW)

| Priority | Label | Description |
|---|---|---|
| Must Have | 🔴 | Core flow is broken without it |
| Should Have | 🟠 | Important for usability or CRM accuracy |
| Could Have | 🟡 | Nice improvement, no critical impact |
| Won't Have (now) | ⚪ | Deferred to future sprint |

---

## 11. Sprint History & Backlog

### Completed

| Sprint | Key Deliverables |
|---|---|
| Sprint 1 | Phone lookup → project creation → property docs upload with AI extraction |
| Sprint 2 | Province selection, region-based signing flow, signature pad, PDF stamping |
| Sprint 3 | Energy certificate survey (4 steps), review & submit, success screen |
| Sprint 4 | Admin dashboard — project list, detail view, ZIP download, CSV export |
| Sprint 5 | Smart routing, offline resilience (IndexedDB backup), session restore |
| Sprint 6 | DocFlow webhook integration (`new_order`, `doc_update`) |
| Sprint 7 | Locale detection (phone prefix), multi-language support (ES/CA) |
| Sprint 8 | DNI dashboard column — merged front + back into single column |
| Sprint 8 | Dashboard shortLabels Spanish consistency (`DNI frontal` / `DNI trasera`) |
| Sprint 8 | Assessor name made mandatory (frontend validation + backend guard) |
| Sprint 8 | Assessor name added to `new_order` webhook payload |

### Current Backlog

| Priority | Story | Notes |
|---|---|---|
| 🔴 | Verify CRM receives `assessor` field on live orders | Webhook fix deployed — monitor Railway logs |
| 🟠 | Dashboard: filter projects by assessor name | Useful for multi-agent teams |
| 🟠 | Dashboard: show assessor column in table | Currently shown in project detail only |
| 🟡 | Customer email notification on submission | Needs SMTP integration |
| 🟡 | Autocropper: auto-apply crop result without manual confirmation | Improve UX speed |
| ⚪ | Multi-tenant / multi-company support | Future if Eltex expands |

---

## 12. Deployment & Infrastructure

### Environments

| Environment | URL | Trigger |
|---|---|---|
| Development | `localhost:5000` (Vite) + `localhost:3001` (Express) | Local / Replit |
| Production | `https://documentos.eltex.es` | Push to `main` on GitHub |

### Railway Services

| Service | Builder | Region |
|---|---|---|
| DOCUMENT-COLLECTION-FORM | Nixpacks (Node.js) | europe-west4 |
| autocropper | Nixpacks (Python) | europe-west4 |

### Persistent Volume
- Mounted at `/data`
- Contains: `db.json` (all projects), `/uploads/` (all files)
- Survives redeployments

### Environment Variables (Railway)

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | AI extraction (Gemini Flash) |
| `DASHBOARD_PASSWORD` | Assessor dashboard login |
| `ELTEX_DOCFLOW_WEBHOOK_URL` | DocFlow CRM webhook endpoint |
| `ELTEX_DOCFLOW_WEBHOOK_SECRET` | Webhook authentication header |
| `PORT` | Set automatically by Railway |
| `DATA_DIR` | Defaults to `/data` |

### CI/CD Pipeline

```
Developer pushes to main
        │
        ▼
GitHub receives push
        │
        ▼
Railway detects push → starts build (Nixpacks)
        │
        ▼
Build: npm install → tsc → vite build
        │
        ▼
Deploy: replace running container
        │
        ▼
Status: SUCCESS / FAILED (visible in Railway dashboard)
```

---

## 13. Security

- **HTTPS only** — enforced by Railway + custom domain TLS
- **helmet** — sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
- **Rate limiting** — `express-rate-limit` on all API endpoints
- **Access tokens** — each project has a `uuid-v4` token; all project mutations require it
- **Dashboard auth** — password-protected; session token returned on login
- **Webhook secret** — `X-Eltex-Webhook-Secret` header validated by DocFlow
- **No user PII in URLs** — project code contains no customer-identifiable information
- **File upload validation** — `multer` enforces file type and size limits
- **No direct DB access** — all data flows through the Express API

---

## 14. Testing

### Unit Tests (Vitest)
- `app/src/lib/identityDocument.test.ts` — DNI/NIE type detection and back-side requirement logic
- `app/src/lib/dashboardProject.test.ts` — Project summary / data resilience

### E2E Tests (Playwright)
- Smoke tests — full customer flow from phone entry to success
- Mobile viewport tests — all steps on 375×812 screen
- Regression tests — DNI back-side requirement, province routing, signature flow

### Manual QA Checklist (per sprint)
- [ ] Create new project as assessor (name required, no SSR default)
- [ ] Upload DNI front only (NIE card) → no back required
- [ ] Upload DNI front only (Spanish card) → back required prompt
- [ ] Upload both DNI sides → dashboard shows "Frontal ✓" + "Trasera ✓"
- [ ] Select Cataluña → 3 documents to sign
- [ ] Select Madrid → 2 documents to sign
- [ ] Select other province → no signing
- [ ] Submit form → DocFlow receives `new_order` with `assessor` field
- [ ] Dashboard: Status column shows pending docs in Spanish labels
- [ ] ZIP download contains all assets
- [ ] Reload mid-form → session restored from IndexedDB

---

*Document generated: April 2026 — Eltex Document Collection Form v1.8*
