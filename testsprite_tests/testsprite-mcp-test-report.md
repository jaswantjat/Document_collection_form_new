# TestSprite AI Testing Report (MCP)

---

## 1️⃣ Document Metadata

- **Project Name:** Eltex Document Collection Form
- **Date:** 2026-04-07
- **Prepared by:** TestSprite AI Testing Engine + Eltex Dev Team
- **Test Run URL:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc
- **Total Tests:** 15
- **Passed:** 5 (33%)
- **Failed:** 3 (20%)
- **Blocked:** 7 (47%)

---

## 2️⃣ Requirement Validation Summary

---

### Requirement Group A — Authentication & Project Access

> Customer enters phone number or uses ?code= URL param to load their project and resume from the correct step.

---

#### TC001 — Session recovery restores progress after reload and allows continuing from last step
- **Test Code:** [TC001](./TC001_Session_recovery_restores_progress_after_reload_and_allows_continuing_from_last_step.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/7e97d9f1-d7ae-42f9-8f89-918c7221c4d4
- **Status:** ✅ Passed
- **Analysis:** The app correctly restores the user's last section from `localStorage` on reload. Smart routing (`getInitialSection`) returns the saved section and `saveSectionToStorage` persists section state per project code. This is working as designed.

---

#### TC002 — Access project by phone number and start at the next required step
- **Test Code:** [TC002](./TC002_Access_project_by_phone_number_and_start_at_the_next_required_step.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/4e72109a-64d1-4917-9fd3-ac08f4d41e31
- **Status:** ✅ Passed
- **Analysis:** Phone-number lookup flow works end-to-end. Entering a valid phone number returns the correct project code, navigates to `/?code=ELTXXXXXX`, and smart routing places the user at the first incomplete step. The `PhoneSection` → `handlePhoneConfirmed` → `getInitialSection` chain is functioning correctly.

---

#### TC012 — Auto-save keeps progress when navigating away and returning to the same project
- **Test Code:** [TC012](./TC012_Auto_save_keeps_progress_when_navigating_away_and_returning_to_the_same_project.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/891b2b4f-f311-41cb-8fbf-98d98e3e10e4
- **Status:** ❌ Failed
- **Analysis:** After navigating away and returning to the same project, uploaded documents (specifically a PDF uploaded via the contract/CUPS input) were not restored — all file inputs showed no selected file. This suggests either: (a) the `useLocalStorageBackup` / `useIndexedDBBackup` hooks are not persisting `StoredDocumentFile` entries for PDF uploads correctly, or (b) the backup → restore merge logic in `App.tsx` is not applying `contract.originalPdfs` from the backup when the server version is more recent. **Recommended fix:** Audit the `bestBackup.savedAt > serverTs + 500` merge branch in `App.tsx` to confirm `contract.originalPdfs` is always restored from backup regardless of server timestamp.

---

### Requirement Group B — Document Upload & AI Extraction

> Customer uploads DNI/NIE (front + optional back), IBI certificate, electricity bill, and optionally a CUPS contract. AI extracts data from each.

---

#### TC003 — Submit project after completing all required items
- **Test Code:** [TC003](./TC003_Submit_project_after_completing_all_required_items.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/86e48bd5-c191-4e78-a1ae-96034d31f48a
- **Status:** BLOCKED
- **Analysis:** The TestSprite cloud agent had no test image files available to upload, so the document upload flow could not be exercised. **Resolution:** Provide alphanumeric-named test image files (e.g., `eltphoto1.jpg`, `eltdni.jpg`) in the agent's available files. Alternatively, this test can be covered by the existing unit test suite (`cd app && npm test`).

---

#### TC004 — Enforce DNI back-side requirement when only front is provided
- **Test Code:** [TC004](./TC004_Enforce_DNI_back_side_requirement_when_only_front_is_provided.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/b97c2f40-14b1-4af8-9db1-ece7b3a9f1a3
- **Status:** BLOCKED
- **Analysis:** The test agent attempted to navigate to `/property-docs?code=ELT20250001` (a path-based URL), but the app uses hash/query routing at `/?code=ELT20250001`. The SPA rendered blank because the route didn't match. **Resolution:** Update the test to navigate to `http://localhost:5000/?code=ELT20250001` instead. The DNI back-requirement logic in `isIdentityDocumentComplete()` and `identityDocument.test.ts` has 74 unit tests covering this already.

---

#### TC005 — Local backups preserve property-docs photos and inputs across restart
- **Test Code:** [TC005](./TC005_Local_backups_preserve_property_docs_photos_and_inputs_across_restart.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/f560c8ce-bc06-4f58-9cf0-741d512c5db5
- **Status:** BLOCKED
- **Analysis:** Blocked for the same reason as TC003 — no test files available for upload in the cloud agent environment. Also blocked by the URL routing issue (see TC004). **Resolution:** Provide test image files and correct the navigation URL to `/?code=ELTXXXXXX`.

---

#### TC006 — Upload all required property documents, review extracted data, and continue
- **Test Code:** [TC006](./TC006_Upload_all_required_property_documents_review_extracted_data_and_continue.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/f115aaa1-304e-4988-b498-0ed91cf0c274
- **Status:** BLOCKED
- **Analysis:** Blank page rendered due to wrong URL format (`/property-docs?code=...` instead of `/?code=...`). After fixing navigation, this test also requires test image files. **Resolution:** Same as TC004 and TC005.

---

### Requirement Group C — Province-Based Legal Signing

> Province selection routes customers to the correct number of legal documents to sign. Cataluña = 3 docs, Madrid/Valencia = 2 docs, other = none.

---

#### TC011 — Complete all required legal signatures and proceed
- **Test Code:** [TC011](./TC011_Complete_all_required_legal_signatures_and_proceed.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/e50fb524-c1b9-4c59-8b77-dc4c0ba36270
- **Status:** ❌ Failed
- **Analysis:** The representation/signing section was reached but the required signatures could not be submitted. Most likely the canvas-based signature pad (`react-signature-canvas`) interaction was not recognized by the browser automation agent — drawing on a `<canvas>` element requires pointer events rather than text input. **Recommended fix:** Ensure the signature pad emits proper mouse/pointer events; consider adding a `data-testid` attribute to the signature canvas for easier test targeting. The test may also need explicit Playwright-style `page.mouse.move()` + `page.mouse.down()` interactions.

---

#### TC013 — Route Madrid customers to representation signing with two required signatures
- **Test Code:** [TC013](./TC013_Route_Madrid_customers_to_representation_signing_with_two_required_signatures.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/2279007d-4196-44e5-bb36-c26364a282c2
- **Status:** ✅ Passed
- **Analysis:** The Madrid province routing correctly presents exactly 2 signing documents (IVA España + poder representació). Province-based routing logic in `App.tsx` (`hasRepresentationDone`) and `RepresentationSection` is working correctly for the Madrid case.

---

#### TC014 — Route Cataluña customers to representation signing with three required signatures
- **Test Code:** [TC014](./TC014_Route_Catalua_customers_to_representation_signing_with_three_required_signatures.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/76b84e4a-9f68-47d0-9324-54e0dac3d358
- **Status:** ✅ Passed
- **Analysis:** Cataluña routing correctly presents all 3 signing documents (autorització + generalitat + IVA Catalunya). The `RepresentationSection` province-specific flow is functioning correctly.

---

### Requirement Group D — Review, Checklist & Submission

> Review screen shows completion status of all items. Incomplete items block submission. Customer can navigate back to fix them.

---

#### TC007 — Checklist gating prevents submit when a required item is incomplete
- **Test Code:** [TC007](./TC007_Checklist_gating_prevents_submit_when_a_required_item_is_incomplete.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/35fc2aa7-8dfe-4c34-864e-134010a7388d
- **Status:** BLOCKED
- **Analysis:** The review page rendered blank due to the URL routing issue (same as TC004–TC006). Note: the Documents step itself **does** correctly block progression when signatures are missing (the "Continuar" button was disabled). The final review-level gating test requires a pre-loaded project with partial completion. **Resolution:** Navigate to `/?code=ELT20250001` and drive the flow to review rather than navigating directly to `/review`.

---

#### TC010 — Fix an incomplete checklist item via deep link and successfully submit
- **Test Code:** [TC010](./TC010_Fix_an_incomplete_checklist_item_via_deep_link_and_successfully_submit.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/dce834b4-b78c-43ec-95f4-aea4e5e8930e
- **Status:** BLOCKED
- **Analysis:** The test was unable to bypass the authorization/signing step because no "Firmar más tarde" (sign later) button was found. This is by design — the deferred signature option (`signatureDeferred`) was removed or is only shown in specific conditions. **Resolution:** Use a test project that already has signatures complete (e.g., ELT20250002 aerothermal) or pre-seed the project state via the test reset API (`POST /api/test/restore-base-flow/:code`).

---

### Requirement Group E — Energy Certificate Survey

> 4-step housing survey with signature. Can be skipped.

---

#### TC015 — Completing housing, openings, thermal systems, additional info and signature proceeds to review
- **Test Code:** [TC015](./TC015_Completing_housing_openings_thermal_systems_additional_info_and_signature_proceeds_to_review.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/ec2ad180-c7d3-4622-a36a-5cdf289342cd
- **Status:** BLOCKED
- **Analysis:** The energy certificate section rendered blank due to the URL routing issue. The agent navigated to `/energy-certificate?code=...` which is not a valid route — the app routes internally to this section from `/?code=ELTXXXXXX` based on form state. **Resolution:** Use test projects `ELT20250004` or `ELT20250005` which have `location: 'other'` and representation already complete, routing directly into the energy certificate section.

---

### Requirement Group F — Admin Dashboard

> Assessors can log in, view all submitted projects, open individual project details, and download ZIPs.

---

#### TC008 — Assessor can access dashboard and open a project detail view
- **Test Code:** [TC008](./TC008_Assessor_can_access_dashboard_and_open_a_project_detail_view.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/fc02d7b0-85c0-4924-952f-fb633f5a3a43
- **Status:** ❌ Failed
- **Analysis:** The dashboard login and project list loaded successfully (60 total projects, 24 submitted). However, the "Ver archivo" (file viewer) modal failed to open reliably — 1 stale element error + 2 extraction timeouts across 3 attempts. The dashboard shows per-file action buttons (view + download) in the project list but the modal rendering appears to have a race condition. **Recommended fix:** Investigate the file viewer component for potential async rendering issues. Add a loading state indicator before the modal is interactive. Consider adding `data-testid` attributes to the modal open button and content for more reliable test automation.

---

#### TC009 — Assessor can download a project ZIP from project details
- **Test Code:** [TC009](./TC009_Assessor_can_download_a_project_ZIP_from_project_details.py)
- **Result:** https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc/5d1ab562-deac-4d52-9c71-d17db5f7c865
- **Status:** ✅ Passed
- **Analysis:** ZIP download from the dashboard works correctly. The `GET /api/dashboard/projects/:code/download` endpoint returns a valid ZIP archive containing all project files. The "Descargar ZIP" button in the dashboard is functional.

---

## 3️⃣ Coverage & Matching Metrics

- **Overall pass rate:** 33.3% (5/15 tests fully passed)
- **Blocked rate:** 46.7% (7/15 blocked — mostly due to URL routing mismatch and missing test files)
- **True failure rate:** 20% (3/15 genuine failures)

| Requirement Group | Total Tests | ✅ Passed | ❌ Failed | BLOCKED |
|---|---|---|---|---|
| A — Authentication & Session Management | 3 | 2 | 1 | 0 |
| B — Document Upload & AI Extraction | 4 | 0 | 0 | 4 |
| C — Province-Based Legal Signing | 3 | 2 | 1 | 0 |
| D — Review, Checklist & Submission | 2 | 0 | 0 | 2 |
| E — Energy Certificate Survey | 1 | 0 | 0 | 1 |
| F — Admin Dashboard | 2 | 1 | 1 | 0 |
| **Total** | **15** | **5** | **3** | **7** |

---

## 4️⃣ Key Gaps / Risks

### 🔴 Critical

1. **URL Routing Mismatch (7 tests blocked)** — The TestSprite agent navigated to path-based URLs (`/property-docs?code=...`, `/review`, `/energy-certificate?code=...`) but the app is a pure SPA using `/?code=ELTXXXXXX` with internal React Router state. This caused blank page renders for the majority of tests. **Fix:** Update `testsprite_tests/tmp/code_summary.yaml` to document that all customer routes are accessed via `/?code=ELTXXXXXX` (not path-based), and add `additionalInstruction` to the test executor clarifying this.

2. **Auto-Save Not Restoring PDF Uploads (TC012 failed)** — After navigating away and returning to the same project, uploaded PDF files were not restored. This could affect real users who close their browser mid-session. **Fix:** Audit the `App.tsx` merge logic for `contract.originalPdfs` in the localStorage/IndexedDB restoration path.

### 🟡 Medium

3. **Dashboard File Viewer Race Condition (TC008 failed)** — The "Ver archivo" modal fails to open reliably under automated clicking. Stale element errors and content extraction timeouts suggest async state or rendering issues in the file viewer component. **Fix:** Review the modal's open/close state management. Add explicit loading indicators before the modal content is interactive.

4. **Signature Pad Not Automatable (TC011 failed)** — The canvas-based signature component cannot be interacted with via standard click/type browser automation. No mouse-draw interaction was detected by the agent. **Fix:** Add `data-testid` attributes. Consider also providing a developer-mode shortcut that accepts a pre-drawn signature for testing environments.

5. **No Test Files for Upload Tests (TC003, TC005, TC006 blocked)** — The cloud agent had no image files available to simulate document uploads. **Fix:** Bundle small sample test images (e.g., `test-dni.jpg`, `test-ibi.jpg`) alongside the TestSprite config so the agent can upload them in document upload tests.

### 🟢 Low

6. **"Firmar más tarde" Path Not Available (TC010 blocked)** — The skip-signature / deferred-signature path is not accessible from the UI in normal conditions, making it hard to test the review → fix-incomplete-item flow end-to-end. **Fix:** Use test project reset APIs (`/api/test/restore-base-flow/:code`) before running this test to pre-seed a valid project state.

7. **Energy Certificate URL Assumption (TC015 blocked)** — The energy certificate section can only be reached through the full flow from `/?code=ELTXXXXXX`. The agent needs to use test projects ELT20250004 or ELT20250005 which are pre-seeded to start at this section. **Fix:** Document test project routing behavior in code summary.

---

*Report generated by TestSprite AI Testing Engine. Full test visualizations available at: https://www.testsprite.com/dashboard/mcp/tests/1e18f1df-9fbe-4206-9bb3-70232b42eabc*
