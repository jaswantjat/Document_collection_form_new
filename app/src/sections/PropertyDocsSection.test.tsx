import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { normalizeFormData } from '@/hooks/useFormState';
import { PropertyDocsSection } from '@/sections/PropertyDocsSection';
import type { DocumentProcessingState, FormData, ProductType, UploadedPhoto } from '@/types';

function makePhoto(id: string): UploadedPhoto {
  return {
    id,
    preview: `data:image/jpeg;base64,${id}`,
    timestamp: 1,
    sizeBytes: 128,
  };
}

function idleState(): DocumentProcessingState {
  return {
    status: 'idle',
    errorCode: undefined,
    errorMessage: undefined,
    pendingPreview: null,
  };
}

function renderPropertyDocs(productType: ProductType, formData: FormData): string {
  return renderToStaticMarkup(
    createElement(PropertyDocsSection, {
      productType,
      dni: formData.dni,
      ibi: formData.ibi,
      electricityBill: formData.electricityBill,
      additionalBankDocuments: formData.additionalBankDocuments ?? [],
      errors: {},
      documentProcessing: {
        dniFront: idleState(),
        dniBack: idleState(),
        ibi: idleState(),
      },
      hasBlockingDocumentProcessing: false,
      onDNIFrontPhotoChange: () => undefined,
      onDNIFrontExtractionChange: () => undefined,
      onDNIBackPhotoChange: () => undefined,
      onDNIBackExtractionChange: () => undefined,
      onDNIIssueChange: () => undefined,
      onDNIOriginalPdfsMerge: () => undefined,
      onIBIDocumentChange: () => undefined,
      onIBIIssueChange: () => undefined,
      onAddElectricityPages: () => undefined,
      onRemoveElectricityPage: () => undefined,
      onElectricityIssueChange: () => undefined,
      onAddAdditionalBankDocuments: () => undefined,
      onReplaceAdditionalBankDocument: () => undefined,
      onRemoveAdditionalBankDocument: () => undefined,
      onDocumentProcessingChange: () => undefined,
      onContinue: () => undefined,
    })
  );
}

describe('PropertyDocsSection', () => {
  it('hides the electricity upload box for pure aerothermal projects', () => {
    const formData = normalizeFormData();
    const html = renderPropertyDocs('aerothermal', formData);

    expect(html).not.toContain('Factura de luz');
    expect(html).not.toContain('data-testid="electricity-input"');
  });

  it('keeps the electricity upload box for solar projects', () => {
    const formData = normalizeFormData();
    const html = renderPropertyDocs('solar', formData);

    expect(html).toContain('Factura de luz');
    expect(html).toContain('data-testid="electricity-input"');
  });

  it('still shows an existing electricity upload for pure aerothermal projects', () => {
    const billPhoto = makePhoto('aerothermal-electricity');
    const formData = normalizeFormData({
      ...normalizeFormData(),
      electricityBill: {
        pages: [{ photo: billPhoto, extraction: null }],
        originalPdfs: [],
        issue: null,
      },
    });
    const html = renderPropertyDocs('aerothermal', formData);

    expect(html).toContain('Factura de luz');
  });

  it('treats multi-page IBI uploads as complete on resume', () => {
    const formData = normalizeFormData({
      ...normalizeFormData(),
      dni: {
        front: { photo: makePhoto('dni-front'), extraction: null },
        back: { photo: makePhoto('dni-back'), extraction: null },
        originalPdfs: [],
        issue: null,
      },
      ibi: {
        photo: null,
        pages: [makePhoto('ibi-page')],
        originalPdfs: [],
        extraction: null,
        issue: null,
      },
    });
    const html = renderPropertyDocs('aerothermal', formData);

    expect(html).not.toContain('data-testid="ibi-input"');
    expect(html).not.toContain('Falta 1 documento por completar.');
  });
});
