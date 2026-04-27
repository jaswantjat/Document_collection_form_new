import { describe, expect, it } from 'vitest';
import { getDashboardStatusItems } from './dashboardProject';

function makeDataUrl(type = 'image/jpeg') {
  return `data:${type};base64,/9j/4AAQSkZJRgABAQEASABIAAD/`;
}

function makePhoto(preview = makeDataUrl()) {
  return { preview, id: 'p1', timestamp: Date.now(), sizeBytes: 1000 };
}

function makeExtraction(overrides: Record<string, unknown> = {}) {
  return {
    extractedData: {},
    confidence: 0.9,
    isCorrectDocument: true,
    documentTypeDetected: 'dni-card',
    needsManualReview: false,
    confirmedByUser: true,
    ...overrides,
  };
}

describe('getDashboardStatusItems', () => {
  it('uses backend summary statusItems when list rows have no formData', () => {
    const items = getDashboardStatusItems({
      summary: {
        statusItems: [
          { key: 'dni', label: 'DNI / NIE', stateLabel: '✓', tone: 'success' },
          { key: 'ibi', label: 'IBI / Escritura', stateLabel: 'pendiente', tone: 'pending' },
        ],
      },
    });

    expect(items).toEqual([
      { key: 'dni', label: 'DNI / NIE', stateLabel: '✓', tone: 'success' },
      { key: 'ibi', label: 'IBI / Escritura', stateLabel: 'pendiente', tone: 'pending' },
    ]);
  });

  it('derives compact status and downloads from backend list summaries without formData', () => {
    const items = getDashboardStatusItems({
      productType: 'solar',
      summary: {
        documents: [
          { key: 'dniFront', label: 'DNI frontal', present: true, needsManualReview: false },
          { key: 'dniBack', label: 'DNI trasera', present: true, needsManualReview: false },
          { key: 'ibi', label: 'IBI / Escritura', present: true, needsManualReview: false },
        ],
        electricityPages: [
          { key: 'electricity_0', label: 'Factura luz — pág. 1', present: true },
        ],
      },
    });

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'dni', stateLabel: '✓', downloadCount: 2 }),
      expect.objectContaining({ key: 'ibi', stateLabel: '✓', downloadCount: 1 }),
      expect.objectContaining({ key: 'electricity', stateLabel: '1 página', downloadCount: 1 }),
    ]));
  });

  it('hides electricity for pure aerothermal projects in the queue status', () => {
    const items = getDashboardStatusItems({
      productType: 'aerothermal',
      formData: {
        dni: {
          front: {
            photo: makePhoto(),
            extraction: makeExtraction({ identityDocumentKind: 'nie-card' }),
          },
          back: null,
        },
        ibi: { pages: [makePhoto()], extraction: null },
        electricityBill: { pages: [] },
      },
    });

    expect(items.some((item) => item.key === 'electricity')).toBe(false);
  });

  it('shows additional documents only after at least one file is uploaded', () => {
    const withoutAdditionalDocs = getDashboardStatusItems({
      formData: {
        dni: { front: {}, back: {} },
        ibi: { pages: [], extraction: null },
        electricityBill: { pages: [] },
        additionalBankDocuments: [],
      },
    });
    const withAdditionalDocs = getDashboardStatusItems({
      formData: {
        dni: { front: {}, back: {} },
        ibi: { pages: [], extraction: null },
        electricityBill: { pages: [] },
        additionalBankDocuments: [
          {
            id: 'extra',
            type: 'other',
            files: [{
              id: 'file-1',
              filename: 'irpf-2024.pdf',
              mimeType: 'application/pdf',
              dataUrl: makeDataUrl('application/pdf'),
              timestamp: 1,
              sizeBytes: 100,
            }],
          },
        ],
      },
    });

    expect(withoutAdditionalDocs.some((item) => item.key === 'additional-documents')).toBe(false);
    expect(withAdditionalDocs).toContainEqual(
      expect.objectContaining({
        key: 'additional-documents',
        label: 'Documento adicional',
        stateLabel: '1 archivo',
      })
    );
  });
});
