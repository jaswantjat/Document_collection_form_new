# Form — First Principles Diagnosis & Playwright Testing

**Started:** 2026-04-01  
**Project under test:** ELT20250001 (solar), ELT20250002 (aerothermal), ELT20250003 (solar)  
**Base URL:** http://localhost:5000  
**Backend:** http://localhost:3001  
**Test phones:** +34612345678 | +34623456789 | +34655443322  

---

## Phase 0 — Environment & Routing Check ✅

| Check | Result |
|---|---|
| Frontend (port 5000) | ✅ Running |
| Backend (port 3001) | ✅ Running |
| Test codes in backend log | ✅ ELT20250001, ELT20250002, ELT20250003 |
| ELT20250001 screenshot | ✅ Already at "Documentos para firmar" (signing step) — pre-filled data |

---

## Phase 1 — Form Structure (static code analysis) ✅

### Section order (driven by `getInitialSection` smart routing)

| # | Section | File | Purpose |
|---|---|---|---|
| 1 | **Phone** | `PhoneSection.tsx` | Entry point — phone lookup or new project creation |
| 2 | **Property Docs** | `PropertyDocsSection.tsx` | DNI, IBI, electricity bill, Eltex contract with AI extraction |
| 3 | **Province Selection** | `ProvinceSelectionSection.tsx` | Jurisdiction detection → which legal docs to show |
| 4 | **Representation** | `RepresentationSection.tsx` | Signature pad + legal document carousel |
| 5 | **Energy Certificate** | `EnergyCertificateSection.tsx` | 4-step technical survey about the home |
| 6 | **Review** | `ReviewSection.tsx` | Final summary + submit button |
| 7 | **Success** | `SuccessSection.tsx` | Completion confirmation |

### Section 1 — Phone
- Fields: `phone` (Spanish format), on new project: `selectedProducts`, `newAssessor`, `newEmail` (optional)
- Smart routing: known phone → jumps to first incomplete section

### Section 2 — Property Docs
- DNI/NIE front + back (camera / upload → AI extraction)
- IBI or Deeds (photo/PDF)
- Electricity Bill (multi-page, photo/PDF)
- Eltex Contract (PDF upload → AI extraction of name, NIF, address etc.)

### Section 3 — Province Selection
- `location`: Cataluña / Madrid / Valencia / Other
- `isCompany`: toggle → if true, shows companyName, companyNIF, companyAddress, companyMunicipality, companyPostalCode
- Other → skips Representation section entirely

### Section 4 — Representation
- Signature pad (one signature applied to all docs)
- Cataluña: 10% IVA Cert (Cat), Generalitat Declaration, Authorization of Representation
- Madrid/Valencia: 10% IVA Cert (Spain), Power of Representation

### Section 5 — Energy Certificate (4 steps)
- Step 1 Housing: cadastral ref (optional), habitableAreaM2, floorCount, bedroomCount, averageFloorHeight, windows, frame/glass material, shutters
- Step 2 Thermal: installationType, fuelType, hasAirConditioning, AC type, heatingEmitterType, radiatorMaterial
- Step 3 Additional: soldProduct, isExistingCustomer, hasSolarPanels
- Step 4: preview of generated energy certificate PDF

### Section 6 — Review
- Summary of all docs + energy cert
- "Enviar documentación" submit button

### Section 7 — Success
- Displays project code + success message

---

## Phase 2 — Step-by-step Playwright Tests

### Test Plan

| Test ID | Description | Project | Expected |
|---|---|---|---|
| T01 | No code → shows phone section | none | Phone input visible |
| T02 | With code+token → smart routing works | ELT20250001 | Lands at correct section |
| T03 | With code+token → smart routing works | ELT20250002 | Lands at correct section |
| T04 | Phone section — enter known phone | +34612345678 | Form loads project |
| T05 | Property docs section renders | ELT20250002 | DNI/IBI/bill/contract cards visible |
| T06 | Province selection renders | auto | Location options visible |
| T07 | Representation section renders | Cataluña project | Documents carousel + signature pad |
| T08 | Energy certificate — step 1 Housing | ELT20250002 | All fields visible |
| T09 | Energy certificate — step 2 Thermal | ELT20250002 | Installation fields visible |
| T10 | Energy certificate — step 3 Additional | ELT20250002 | Product/customer fields visible |
| T11 | Review section renders | ELT20250001 | Summary + submit button visible |
| T12 | Backend /api/projects responds | direct | 200 or known error |

---

## Test Results

| Test ID | Status | Screenshot | Notes |
|---|---|---|---|
| T01 | 🔄 | — | — |
| T02 | 🔄 | — | — |
| T03 | 🔄 | — | — |
| T04 | 🔄 | — | — |
| T05 | 🔄 | — | — |
| T06 | 🔄 | — | — |
| T07 | 🔄 | — | — |
| T08 | 🔄 | — | — |
| T09 | 🔄 | — | — |
| T10 | 🔄 | — | — |
| T11 | 🔄 | — | — |
| T12 | 🔄 | — | — |

---

## Issues Found

_(none yet — tests not started)_

---

## Status
- Phase 0: ✅ Complete
- Phase 1: ✅ Complete (full form structure documented)
- Phase 2: 🔄 In progress — writing tests now
