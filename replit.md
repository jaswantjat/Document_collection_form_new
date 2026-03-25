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

## Test Data

Default projects seeded in db.json:
- `ELT20250001` — María García López (solar)
- `ELT20250002` — Juan Pérez Martínez (aerothermal)
- `ELT20250003` — Laura Fernández Ruiz (solar)

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
