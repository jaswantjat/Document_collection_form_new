# Bug Fix: ID Upload Field — Identity Number Validation

**Date:** 2026-04-02  
**Status:** Fixed  
**Severity:** Medium — wrong approach to document validation

## Problem

The ID upload field (DNI/NIE slot) was only designed to accept Spanish DNI/NIE cards and would accept any card-shaped document because validation was document-type-based, not content-based. The real requirement is: **extract a valid identity number** (DNI, NIE, or passport number) from whatever the user uploads. If no identity number is found, reject it.

## Root Cause

Original prompts gated acceptance on document type ("is this a DNI/NIE card?") rather than on the presence of a valid identity number. This caused two problems:
1. Documents with identity numbers but unusual formats (passports, EU cards) were being rejected
2. Without verifying the extracted number format, some documents without real identity numbers could slip through

## Fix — Identity-Number-First Validation

### Layer 1 — AI Prompt Updates (`backend/server.js`, `PROMPTS` constant)

All four DNI-related prompts (`dniFront`, `dniBack`, `dniAuto`, `dniAutoBatch`) were updated to:
- Accept any document that contains a recognisable identity number: DNI, NIE, or passport
- Add "passport" as a valid `identityDocumentKind`
- Set `isCorrectDocument: false` ONLY if the image contains NO recognisable identity number
- Put the identity number (DNI/NIE number OR passport number) into the `dniNumber` field

### Layer 2 — Backend Safety-Net (`backend/server.js`)

Added `isValidIdentityNumber(number)` function that validates:
- Spanish DNI: 8 digits + 1 letter (e.g. 12345678A)
- Spanish NIE: X/Y/Z/T + 7 digits + 1 letter (e.g. X1234567A)
- Passport: most international formats (alphanumeric, 6–12 chars)

Applied in `/api/extract-dni-batch`: if the AI accepts a front-page document but no valid identity number was extracted → `needsManualReview: true` so an assessor can check it manually (not hard-rejected, since the number might be there but unclear).

### Layer 3 — normalizeIdentityExtraction() update

Passports are now recognised as a valid `identityDocumentKind`. They are always treated as `side: "front"`.

`IDENTITY_DOCUMENT_KINDS` now includes `'passport'`.

## Files Changed

- `backend/server.js` — prompts, `isValidIdentityNumber()`, safety-net, `IDENTITY_DOCUMENT_KINDS`, `normalizeIdentityExtraction()`

## QA Verification

An independent testing agent verified the fix from first principles:
- `isValidIdentityNumber()` correctly validates DNI, NIE, and international passport formats
- `dniAutoBatch` prompt accepts passports and focuses on identity number extraction
- `IDENTITY_DOCUMENT_KINDS` includes 'passport'
- `normalizeIdentityExtraction()` forces passports to side "front"
- Safety-net uses `isValidIdentityNumber()`, not document-type keywords
- No hard-rejection for uncertain documents — flags for manual review instead
- All secondary prompts (`dniAuto`, `dniFront`) also updated consistently
