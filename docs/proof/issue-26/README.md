# Issue 26 Proof

Issue: `#26` - Simplify dashboard queue into one status column with minimal filters

Date: `2026-04-23`

## Acceptance Proof

- Simplified queue list with one `Estado` column:
  `queue-list-before-upload.png`
- Status column renders one line per relevant item:
  `status-column-before-upload.png`
- `Documento adicional` stays hidden until uploaded:
  `queue-list-before-upload.png`
- `Documento adicional` appears in the status column after upload:
  `queue-list-after-upload.png`
  `status-column-after-upload.png`
- Row ZIP remains available and downloadable:
  `queue-row-with-zip.png`
  `zip-download-proof.webm`

## Proof Run

Local dashboard proof project:

- Project code: `ELT20260434`
- ZIP filename returned by the row download: `ELT20260434_Cliente_nuevo.zip`

Validation commands run on this branch:

```bash
npm --prefix app run test
npm --prefix app run lint
npm --prefix app run build
E2E_BASE_URL=http://localhost:5003 E2E_API_BASE_URL=http://localhost:3002 \
  npx playwright test tests/e2e/dashboard.spec.ts tests/e2e/bug-regressions.spec.ts --reporter=list
```

Results:

- `npm --prefix app run test`: `304/304` passed
- `npm --prefix app run lint`: `0` errors, `3` warnings
- `npm --prefix app run build`: passed
- `dashboard.spec.ts` + `bug-regressions.spec.ts`: `23/23` passed

## Artifact Files

- [queue-list-before-upload.png](./queue-list-before-upload.png)
- [status-column-before-upload.png](./status-column-before-upload.png)
- [queue-row-with-zip.png](./queue-row-with-zip.png)
- [queue-list-after-upload.png](./queue-list-after-upload.png)
- [status-column-after-upload.png](./status-column-after-upload.png)
- [zip-download-proof.webm](./zip-download-proof.webm)
- [proof-summary.json](./proof-summary.json)
