# Energy Certificate Survey v1

## Summary

Add a new optional `energy-certificate` step to the customer flow.

The customer completes a short questionnaire in three parts:

1. `Características de la Vivienda`
2. `Características de la Instalación Térmica`
3. `Equipamiento e información adicional`

At the end of the flow, the app shows the final summary template image with all answers overlaid and asks the customer to sign it. The signed output is stored as a generated document artifact and exposed in the dashboard as a read-only PDF preview/download.

This implementation must remain isolated from the existing representation overlay system. Existing overlay coordinates for current documents must not be changed.

## Goals

- Add the new survey to the customer journey without breaking the current document collection flow.
- Keep the survey optional so the customer can still submit the project when skipped.
- Generate a signed final artifact for completed surveys.
- Expose clear status in the dashboard:
  - `Pendiente`
  - `Completado`
  - `Saltado por cliente`

## Non-Goals

- No dashboard editing of the survey in v1.
- No changes to existing representation template coordinates.
- No replacement of the current `productType` model.

## UX Flow

### Standard flow

`property-docs -> province-selection -> representation/skip -> energy-certificate -> review`

### Follow-up flow

`property-docs -> energy-certificate -> review`

### Resume rules

- `completed`: skip this step on reopen unless the user explicitly edits it
- `skipped`: skip this step on reopen unless the user explicitly edits it
- `in-progress`: resume inside the survey

## Survey Data Model

Add `energyCertificate` to `FormData`.

```ts
type EnergyCertificateStatus = 'not-started' | 'in-progress' | 'skipped' | 'completed';
```

Stored structure:

- `status`
- `housing`
  - `cadastralReference`
  - `habitableAreaM2`
  - `floorCount`
  - `averageFloorHeight`
  - `bedroomCount`
  - `doorsByOrientation`
  - `windowsByOrientation`
  - `windowFrameMaterial`
  - `doorMaterial`
  - `windowGlassType`
  - `hasShutters`
  - `shutterWindowCount`
- `thermal`
  - `thermalInstallationType`
  - `boilerFuelType`
  - `equipmentDetails`
  - `hasAirConditioning`
  - `airConditioningType`
  - `airConditioningDetails`
  - `heatingEmitterType`
  - `radiatorMaterial`
- `additional`
  - `soldProduct`
  - `isExistingCustomer`
  - `hasSolarPanels`
  - `solarPanelDetails`
- `customerSignature`
- `renderedDocument`
- `completedAt`
- `skippedAt`

## Final Rendered Document

Use the provided certificate summary image as the v1 template.

Overlay:

- customer name
- existing-customer flag
- address
- phone
- email
- DNI/NIE
- assessor
- form date
- sold product
- housing answers
- doors/windows matrix
- thermal answers
- solar-related answers
- customer signature

Generate one rendered image asset and one dashboard-downloadable PDF from it.

## Dashboard Behavior

Dashboard remains read-only for this survey in v1.

Show:

- survey status badge in the row/detail view
- preview in detail modal when completed
- `Ver PDF` and `Descargar PDF` when completed
- inclusion in ZIP/export when completed

## Implementation Tasks

### 1. Add state and routing

- Add `energyCertificate` to `FormData`
- Add `energy-certificate` to `Section`
- Add defaults and normalization for backward compatibility
- Insert the new section into standard and follow-up flows

### 2. Build customer survey UI

- Build the three survey pages
- Add skip behavior
- Add final page with live overlay preview
- Add customer signature pad
- Persist autosave state

### 3. Generate signed artifact

- Build a new isolated energy-certificate renderer
- Render the final summary template
- Store the rendered asset in form data
- Convert the rendered image to PDF for dashboard export

### 4. Dashboard integration

- Surface status in the dashboard summary
- Show preview/download in the detail modal
- Include the generated PDF in ZIP export

### 5. QA and regression protection

- verify full completion path
- verify skip path
- verify resume path
- verify follow-up path
- verify dashboard preview/download
- verify ZIP export
- verify no regression in current representation flows

## Acceptance Criteria

- Customer can complete the survey and sign the final summary document.
- Customer can skip the survey and still submit the project.
- Completed surveys show as `Completado` in the dashboard.
- Skipped surveys show as `Saltado por cliente` in the dashboard.
- Completed surveys expose a PDF in dashboard detail and ZIP export.
- Old projects with no `energyCertificate` continue to load safely.
- Existing representation overlays remain unchanged.
