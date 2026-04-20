import { describe, expect, it } from 'vitest';
import {
  getDashboardDocuments,
  getDashboardEnergyCertificateSummary,
  getDashboardProjectSummary,
} from './dashboardProject';

function makeStrippedPhoto() {
  return { id: 'photo-1', timestamp: 1, sizeBytes: 100 };
}

function makeSummaryDocument(key: string, label: string, shortLabel: string) {
  return {
    key,
    label,
    shortLabel,
    present: true,
    dataUrl: null,
    mimeType: null,
    needsManualReview: false,
    extractedData: null,
  };
}

describe('dashboard asset-backed regressions', () => {
  it('keeps stripped asset-backed primary documents marked as present', () => {
    const summary = getDashboardProjectSummary({
      formData: {
        dni: {
          front: { photo: makeStrippedPhoto(), extraction: null },
          back: { photo: makeStrippedPhoto(), extraction: null },
          originalPdfs: [],
        },
        ibi: {
          photo: null,
          pages: [makeStrippedPhoto()],
          originalPdfs: [],
          extraction: null,
        },
        electricityBill: {
          pages: [{ photo: makeStrippedPhoto(), extraction: null }],
          originalPdfs: [],
        },
        representation: {},
        signatures: {},
        contract: { originalPdfs: [], extraction: null },
      },
      assetFiles: {
        dniFront: '/uploads/assets/ELT001/dniFront.jpg',
        dniBack: '/uploads/assets/ELT001/dniBack.jpg',
        ibi_0: '/uploads/assets/ELT001/ibi_0.jpg',
        electricity_0: '/uploads/assets/ELT001/electricity_0.jpg',
      },
    });

    expect(summary.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'dniFront', present: true, dataUrl: '/uploads/assets/ELT001/dniFront.jpg' }),
      expect.objectContaining({ key: 'dniBack', present: true, dataUrl: '/uploads/assets/ELT001/dniBack.jpg' }),
      expect.objectContaining({ key: 'ibi', present: true, dataUrl: '/uploads/assets/ELT001/ibi_0.jpg' }),
    ]));
    expect(summary.electricityPages).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'electricity_0', present: true, dataUrl: '/uploads/assets/ELT001/electricity_0.jpg' }),
    ]));
    expect(summary.counts.documentsPresent).toBe(4);
    expect(summary.counts.documentsRemaining).toBe(0);
  });

  it('trusts backend summary presence for list rows even when previews are stripped', () => {
    const docs = getDashboardDocuments({
      summary: {
        documents: [
          makeSummaryDocument('dniFront', 'DNI frontal', 'DNI frontal'),
          makeSummaryDocument('dniBack', 'DNI trasera', 'DNI trasera'),
          makeSummaryDocument('ibi', 'IBI / Escritura', 'IBI'),
        ],
      },
      formData: null,
    });

    expect(docs.every((item) => item.present)).toBe(true);
  });

  it('uses the stored energy certificate asset when the rendered preview was stripped', () => {
    const summary = getDashboardEnergyCertificateSummary({
      summary: {
        energyCertificate: {
          status: 'completed',
          completedAt: '2026-04-20T09:00:00Z',
        },
      },
      assetFiles: {
        energyCert: '/uploads/assets/ELT001/energyCert.webp',
      },
      formData: null,
    });

    expect(summary).toMatchObject({
      status: 'completed',
      needsRegeneration: false,
      asset: expect.objectContaining({
        dataUrl: '/uploads/assets/ELT001/energyCert.webp',
        mimeType: 'image/webp',
      }),
    });
  });
});
