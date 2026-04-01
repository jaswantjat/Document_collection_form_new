# Energy Certificate Required Fields & Contract OCR — Task Checklist

## Problems / Goals
1. **Energy certificate**: All fields must be required, except the *Referencia Catastral* which is optional.
2. **Contract OCR**: Stop extracting price/amount (`totalAmount`) from contracts — no financial data in OCR output.
3. **Model**: Switch to `google/gemini-3.1-flash-lite-preview`.

---

## Task 1 — Energy Certificate: Make all fields required (except catastral reference)

### Files changed
- `app/src/lib/energyCertificateValidation.ts` — removed `cadastralReference` validation
- `app/src/sections/EnergyCertificateSection.tsx` — updated housing step description

### What was changed
- **Before**: `cadastralReference` was validated as required on the housing step (showed "Introduce la referencia catastral" error if blank)
- **After**: `cadastralReference` is optional — the validation block was removed. A comment marks the intentional exception.
- All other fields across all 3 data steps (housing, thermal, additional) remain required as before:
  - **Housing**: habitableAreaM2, floorCount, bedroomCount, averageFloorHeight, windowFrameMaterial, windowGlassType, hasShutters
  - **Thermal**: thermalInstallationType, boilerFuelType, hasAirConditioning, airConditioningType (if AC), heatingEmitterType, radiatorMaterial (if not suelo-radiante)
  - **Additional**: soldProduct, isExistingCustomer, hasSolarPanels
- Updated the housing step description from *"Completa solo los datos que tengas del inmueble."* → *"La referencia catastral es opcional. Los demás datos son obligatorios."*

### Status: [x] Done ✅

---

## Task 2 — Contract OCR: Remove price extraction

### Files changed
- `backend/server.js` — `PROMPTS.contract`
- `app/src/sections/PropertyDocsSection.tsx` — removed `totalAmount` from `CONTRACT_FIELDS` display list

### What was changed
- **Prompt list**: Removed item 11 ("Total amount including taxes")
- **Prompt rules**: Added explicit rule "Do NOT extract any price, amount, or cost figures."
- **Prompt JSON schema**: Removed `totalAmount` field from the response JSON schema
- **UI display**: Removed `{ key: 'totalAmount', label: 'Importe total' }` from `CONTRACT_FIELDS` (no longer shown in the contract card since it's never extracted)

### Status: [x] Done ✅

---

## Task 3 — Model switch

### File changed
- `backend/server.js` line 56

| | Value |
|---|---|
| Before | `google/gemini-3.1-flash-lite-preview` → was `google/gemini-2.0-flash-lite` |
| After | `google/gemini-3.1-flash-lite-preview` |

Override still available via `OPENROUTER_MODEL` env var.

### Status: [x] Done ✅

---

## Task 4 — TypeScript check

- `cd app && npx tsc --noEmit` — passed with zero errors ✅

### Status: [x] Done ✅

---

## Status
- Started: 2026-04-01
- Completed: 2026-04-01
- Tasks complete: 4/4 ✅
