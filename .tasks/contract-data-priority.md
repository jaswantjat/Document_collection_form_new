# Contract Data Priority — Task Checklist

## Problem
When a contract is uploaded, its extracted data (client name, address, province, NIF, municipality, postal code) should be the **first priority** source for all overlay PDFs (10% IVA Cataluña, Generalitat, Representació, IVA España, Poder de Representación) and dashboard display. Currently, only the backend `getProjectSnapshot` was updated — the frontend `getSnapshot` function in `signedDocumentOverlays.ts` still ignores the contract entirely.

## Ground Rules
- **Do NOT touch coordinate mappings** (box positions, field sizes, draw calls)
- **Do NOT add `totalAmount` to any overlay** — price stays in extraction data only
- Only replace the *source* of each text value, never the structure that places it

---

## Tasks

### [x] 1. Backend `getProjectSnapshot` — updated
- File: `backend/server.js`
- `contract.fullName || dniFront.fullName || eb.titular || ibi.titular`
- `contract.nif || dniFront.dniNumber || ...`
- `contract.address || eb.direccionSuministro || ...`
- `contract.municipality || eb.municipio || ...`
- `contract.province || eb.provincia`
- `contract.postalCode || eb.codigoPostal || ...`

### [x] 2. Frontend `getSnapshot` in `signedDocumentOverlays.ts` — CORE FIX
- File: `app/src/lib/signedDocumentOverlays.ts`
- Function: `getSnapshot(source)` at line 83
- Added `const contract = fd?.contract?.extraction?.extractedData || {};`
- All field fallback chains updated to put `contract.*` first
- Fields updated:
  - `fullName`: `contract.fullName || dniFront.fullName || eb0.titular || ...`
  - `dniNumber`: `contract.nif || dniFront.dniNumber || eb0.nifTitular || ...`
  - `address`: `contract.address || dniBack.address || eb0.direccionSuministro || ...`
  - `municipality`: `contract.municipality || dniBack.municipality || eb0.municipio || ...`
  - `province`: `contract.province || eb0.provincia || eb1.provincia || ''`
  - `postalCode`: `contract.postalCode || eb0.codigoPostal || eb1.codigoPostal || ...`
- Draw calls, coordinates untouched

### [x] 3. Backend customer name — update from contract as fallback
- File: `backend/server.js`
- Lines 608–641: reads `contractName || dniName` (contract first, then DNI front)
- Both update paths (document upload + contract upload) now resolved correctly

### [x] 4. Verify `totalAmount` is NOT leaking into overlays
- Confirmed: `totalAmount` does NOT appear in `signedDocumentOverlays.ts` draw calls
- It only appears in the AI extraction prompt schema in `server.js` (correct)

### [x] 5. Invalidate stale cached overlays after getSnapshot change
- `SIGNED_DOCUMENT_TEMPLATE_VERSION` bumped from `2026-04-01.1` → `2026-04-01.2`
- Any stored rendered documents with the old version will be regenerated on next view

### [x] 6. TypeScript check + smoke test
- `cd app && npx tsc --noEmit` — passed with zero errors

---

## Status
- Started: 2026-04-01
- Completed: 2026-04-01
- Tasks complete: 6/6 ✅
