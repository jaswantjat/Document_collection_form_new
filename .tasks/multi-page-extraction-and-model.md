# Multi-Page Extraction & Model — Task Checklist

## Problem / Goal
1. Ensure **all extracted pages** from any uploaded document are always sent together in a single AI call — no page is dropped or processed separately.
2. Confirm and switch to **Gemini 2.0 Flash Lite** as the default AI model.
3. Fix a TypeScript type gap where `extractDocumentBatch` didn't include `'contract'` as a valid document type.

## Ground Rules
- Do NOT change prompt text or coordinate mappings
- Do NOT add page limits anywhere
- Keep batch behaviour: all valid pages → one AI call → merged result

---

## Architecture: How pages flow (confirmed)

### PDF → images
- `pdfToImages.ts` → `convertViaBackend()` → Stirling-PDF returns ALL pages as a ZIP
- Fallback: `convertInBrowser()` → renders every page via pdf.js (`for pageNumber = 1 to pdf.numPages`)
- **No page cap exists anywhere in this path**

### Images → extraction
| Document type | Extraction call | All-pages? |
|---|---|---|
| Electricity bill | `extractDocumentBatch(allValidFiles, 'electricity')` | ✅ Yes |
| IBI (≥2 pages) | `extractDocumentBatch(allPages, 'ibi')` | ✅ Yes |
| IBI (1 page) | `extractDocument(singlePage, 'ibi')` | ✅ Yes (trivially) |
| Contract (≥2 pages) | `extractDocumentBatch(allPages, 'contract')` | ✅ Yes |
| Contract (1 page) | `extractDocument(singlePage, 'contract')` | ✅ Yes (trivially) |
| DNI | `extractDniBatch(allPages)` | ✅ Yes |

### Backend batch endpoint (`/api/extract-batch`)
- Receives `imagesBase64[]` — one entry per page
- Sends ALL images as image_url parts in a single OpenRouter call
- Injects a "IMPORTANT: you are receiving N images — they are ALL pages of the SAME document" note when N > 1
- Returns a single merged JSON extraction

---

## Tasks

### [x] 1. Confirm no page limit in PDF conversion
- `pdfToImages.ts` `convertInBrowser()`: iterates `1 to pdf.numPages` — no limit ✅
- `pdf-to-images` backend: sends full PDF to Stirling, returns all ZIP entries — no limit ✅

### [x] 2. Confirm all document types send all pages in one call
- Electricity, IBI, Contract, DNI — all confirmed above ✅
- No `.slice()` or max-page guard before AI call ✅

### [x] 3. Switch AI model to Gemini 2.0 Flash Lite
- **File:** `backend/server.js` line 56
- **Before:** `'google/gemini-2.0-flash-001'`
- **After:** `'google/gemini-2.0-flash-lite'`
- Override still works via `OPENROUTER_MODEL` env var if needed

### [x] 4. Fix TypeScript type for `extractDocumentBatch`
- **File:** `app/src/services/api.ts` line 137
- **Before:** `documentType: 'electricity' | 'ibi'`
- **After:** `documentType: 'electricity' | 'ibi' | 'contract'`
- The function was already called with `'contract'` at runtime; now types match

### [x] 5. TypeScript check
- `cd app && npx tsc --noEmit` — passed with zero errors ✅

---

## Status
- Started: 2026-04-01
- Completed: 2026-04-01
- Tasks complete: 5/5 ✅
