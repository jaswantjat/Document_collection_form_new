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

### [ ] 2. Frontend `getSnapshot` in `signedDocumentOverlays.ts` — CORE FIX
- File: `app/src/lib/signedDocumentOverlays.ts`
- Function: `getSnapshot(source)` at line 83
- Add `const contract = fd?.contract?.extraction?.extractedData || {};`
- Update all field fallback chains to put `contract.*` first
- Fields to update:
  - `fullName`: `contract.fullName || dniFront.fullName || eb0.titular || ...`
  - `dniNumber`: `contract.nif || dniFront.dniNumber || eb0.nifTitular || ...`
  - `address`: `contract.address || dniBack.address || eb0.direccionSuministro || ...`
  - `municipality`: `contract.municipality || dniBack.municipality || eb0.municipio || ...`
  - `province`: `contract.province || eb0.provincia || eb1.provincia || ''`
  - `postalCode`: `contract.postalCode || eb0.codigoPostal || eb1.codigoPostal || ...`
- Do NOT modify anything below line 107 (draw calls, coordinates stay untouched)

### [ ] 3. Backend customer name — update from contract as fallback
- File: `backend/server.js`
- Lines 608 and 637: currently only reads from `dniFront.fullName`
- Add contract name as fallback: `dniName || formData?.contract?.extraction?.extractedData?.fullName`

### [ ] 4. Verify `totalAmount` is NOT leaking into overlays
- Confirm `totalAmount` does not appear in any overlay draw call
- It must remain in contract extraction only (for display in the contract card)

### [ ] 5. Invalidate stale cached overlays after getSnapshot change
- The template version constant `SIGNED_DOCUMENT_TEMPLATE_VERSION` controls cache invalidation
- Bump the version so existing (incorrectly empty) rendered documents are regenerated
- Any user who already signed will need to re-sign (acceptable since data was wrong before)

### [ ] 6. TypeScript check + smoke test
- `cd app && npx tsc --noEmit`
- Visual check: open test project with only contract uploaded, navigate to signing screen, verify fields populate

---

## Status
- Started: 2026-04-01
- Tasks complete: 1/6
