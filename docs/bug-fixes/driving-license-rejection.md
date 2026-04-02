# Bug Fix: Driving License Accepted in DNI Upload Field

**Date:** 2026-04-02  
**Status:** Fixed  
**Severity:** High — incorrect document accepted as valid identity proof

## Problem

The ID upload field (DNI/NIE slot) was accepting Spanish driving licenses (`carnet de conducir / permiso de conducción`) as valid documents. Even when a user uploaded a driving license instead of a DNI or NIE, the system accepted it and proceeded with extraction.

## Root Cause

The AI validation prompts in `backend/server.js` said only:
> "If this is NOT a DNI/NIE, set `isCorrectDocument: false`."

A driving license looks nearly identical to a DNI/NIE card:
- Same plastic card format
- Has a photo, full name, ID number, birth date, expiry date
- The AI confused it as a valid identity document

No explicit exclusion of driving licenses existed in the prompts, and no post-processing check caught this case.

## Fix (Two-Layer Defence)

### Layer 1 — AI Prompt Updates (`backend/server.js`, `PROMPTS` constant)

All four DNI-related prompts were updated to explicitly call out driving licenses.

Prompts updated: `dniFront`, `dniBack`, `dniAuto`, `dniAutoBatch`

Each now includes a CRITICAL section:

```
CRITICAL — Documents that are NOT valid and must be rejected (isCorrectDocument: false):
- Driving license / carnet de conducir / permiso de conducción (even if it looks like a card with a photo and ID number)
- Passport / pasaporte
- Any document that is NOT specifically a Spanish DNI or NIE
```

### Layer 2 — Backend Safety-Net (`backend/server.js`)

Added a `isDrivingLicenseDetected()` function that scans the AI's `documentTypeDetected` and `notes` fields for driving license keywords in both English and Spanish:

```javascript
const DRIVING_LICENSE_KEYWORDS = [
  'driving', 'driver', 'license', 'licence',
  'carnet de conducir', 'permiso de conducir', 'permiso de conducción',
  'conducir', 'conducción', 'dl ', ' dl', 'driving license', 'driving licence',
];
```

This check is applied after the `isCorrectDocument` check in:
- `/api/extract` — for `dniFront`, `dniBack`, `dniAuto` document types
- `/api/extract-dni-batch` — for the batch DNI processing endpoint

Scope: Only applied when `documentType.includes('dni')` — not applied to IBI, electricity, or contract types.

Error message returned to user:
> "Documento incorrecto. El carnet de conducir no es válido. Por favor sube el DNI/NIE."

## Files Changed

- `backend/server.js` — prompts + safety-net function + checks in both endpoints

## QA Verification

An independent testing agent verified the fix from first principles:
- All 4 prompts contain explicit driving license rejection language
- Safety-net function covers English and Spanish keyword variants
- Safety-net is correctly scoped to DNI document types only
- Error message is specific and actionable for users
- No false positive risk for valid DNI/NIE documents
