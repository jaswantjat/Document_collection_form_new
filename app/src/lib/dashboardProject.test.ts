/**
 * TDD — Layer 1: dashboardProject.ts
 * First-principles tests with null / undefined / bad data inputs.
 * Red → Green → Refactor.
 */

import { describe, it, expect } from 'vitest';
import {
  getDashboardAdditionalBankDocumentAssets,
  getDashboardDocuments,
  getDashboardElectricityPages,
  getDashboardEnergyCertificateSummary,
  getDashboardPhotoGroups,
  getDashboardSignedPdfItems,
  getDashboardFinalSignatureAssets,
  getDashboardProjectSummary,
} from './dashboardProject';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// getDashboardDocuments — bad data conditions
// ─────────────────────────────────────────────────────────────────────────────
describe('getDashboardDocuments — null / bad data', () => {
  it('handles null project gracefully', () => {
    const docs = getDashboardDocuments(null);
    expect(docs).toHaveLength(3); // dniFront, dniBack, ibi always present as slots
    expect(docs.every((d) => d.present === false)).toBe(true);
  });

  it('handles undefined project gracefully', () => {
    const docs = getDashboardDocuments(undefined);
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.dataUrl === null)).toBe(true);
  });

  it('handles project with null formData', () => {
    const docs = getDashboardDocuments({ formData: null });
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => !d.present)).toBe(true);
  });

  it('handles project with empty formData object', () => {
    const docs = getDashboardDocuments({ formData: {} });
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => !d.present)).toBe(true);
  });

  it('marks dniFront as present when front photo exists', () => {
    const project = {
      formData: {
        dni: { front: { photo: makePhoto(), extraction: null }, back: null },
      },
    };
    const docs = getDashboardDocuments(project);
    const front = docs.find((d) => d.key === 'dniFront')!;
    expect(front.present).toBe(true);
    expect(front.dataUrl).toBeTruthy();
  });

  it('marks dniFront as not present when front photo is null', () => {
    const project = { formData: { dni: { front: { photo: null } } } };
    const docs = getDashboardDocuments(project);
    const front = docs.find((d) => d.key === 'dniFront')!;
    expect(front.present).toBe(false);
  });

  it('reflects needsManualReview from DNI extraction', () => {
    const project = {
      formData: {
        dni: {
          front: {
            photo: makePhoto(),
            extraction: makeExtraction({ needsManualReview: true }),
          },
        },
      },
    };
    const docs = getDashboardDocuments(project);
    const front = docs.find((d) => d.key === 'dniFront')!;
    expect(front.needsManualReview).toBe(true);
  });

  it('does not throw when dni has deeply missing nested properties', () => {
    const project = { formData: { dni: { front: {}, back: {} } } };
    expect(() => getDashboardDocuments(project)).not.toThrow();
  });

  it('picks up IBI from pages array (new format)', () => {
    const project = {
      formData: {
        ibi: { pages: [makePhoto(), makePhoto()], photo: null, originalPdfs: [] },
      },
    };
    const docs = getDashboardDocuments(project);
    const ibi = docs.find((d) => d.key === 'ibi')!;
    expect(ibi.present).toBe(true);
  });

  it('falls back to ibi.photo when pages is empty', () => {
    const project = {
      formData: {
        ibi: { pages: [], photo: makePhoto(), originalPdfs: [] },
      },
    };
    const docs = getDashboardDocuments(project);
    const ibi = docs.find((d) => d.key === 'ibi')!;
    expect(ibi.present).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDashboardElectricityPages — legacy format + bad data
// ─────────────────────────────────────────────────────────────────────────────
describe('getDashboardElectricityPages — bad data + legacy format', () => {
  it('returns single empty slot when no electricity data exists', () => {
    const pages = getDashboardElectricityPages(null);
    expect(pages).toHaveLength(1);
    expect(pages[0].present).toBe(false);
    expect(pages[0].key).toBe('electricity_0');
  });

  it('returns single empty slot when formData.electricityBill is null', () => {
    const pages = getDashboardElectricityPages({ formData: { electricityBill: null } });
    expect(pages).toHaveLength(1);
    expect(pages[0].present).toBe(false);
  });

  it('returns correct count for multi-page electricity bills', () => {
    const project = {
      formData: {
        electricityBill: {
          pages: [
            { photo: makePhoto(), extraction: null },
            { photo: makePhoto(), extraction: null },
          ],
        },
      },
    };
    const pages = getDashboardElectricityPages(project);
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => p.present)).toBe(true);
  });

  it('handles legacy front/back format', () => {
    const project = {
      formData: {
        electricityBill: {
          front: { photo: makePhoto() },
          back: { photo: makePhoto() },
        },
      },
    };
    const pages = getDashboardElectricityPages(project);
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it('marks page as not present when photo is null', () => {
    const project = {
      formData: {
        electricityBill: {
          pages: [{ photo: null, extraction: null }],
        },
      },
    };
    const pages = getDashboardElectricityPages(project);
    expect(pages[0].present).toBe(false);
  });

  it('does not throw with an empty pages array', () => {
    const project = { formData: { electricityBill: { pages: [] } } };
    expect(() => getDashboardElectricityPages(project)).not.toThrow();
    const pages = getDashboardElectricityPages(project);
    expect(pages[0].present).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDashboardEnergyCertificateSummary — all status branches + bad data
// ─────────────────────────────────────────────────────────────────────────────
describe('getDashboardEnergyCertificateSummary — status branches + bad data', () => {
  it('returns pending for null project', () => {
    const result = getDashboardEnergyCertificateSummary(null);
    expect(result.status).toBe('pending');
    expect(result.asset).toBeNull();
  });

  it('returns pending for null energyCertificate', () => {
    const result = getDashboardEnergyCertificateSummary({ formData: { energyCertificate: null } });
    expect(result.status).toBe('pending');
  });

  it('returns pending for status="not-started"', () => {
    const result = getDashboardEnergyCertificateSummary({
      formData: { energyCertificate: { status: 'not-started' } },
    });
    expect(result.status).toBe('pending');
  });

  it('returns pending for status="in-progress"', () => {
    const result = getDashboardEnergyCertificateSummary({
      formData: { energyCertificate: { status: 'in-progress' } },
    });
    expect(result.status).toBe('pending');
  });

  it('returns skipped for status="skipped"', () => {
    const result = getDashboardEnergyCertificateSummary({
      formData: { energyCertificate: { status: 'skipped' } },
    });
    expect(result.status).toBe('skipped');
    expect(result.label).toContain('Saltado');
  });

  it('returns pending (not completed) for status="completed" with missing required fields — guards against bad data', () => {
    const result = getDashboardEnergyCertificateSummary({
      formData: {
        energyCertificate: {
          status: 'completed',
          housing: {
            habitableAreaM2: '', // required but empty — bad data
            floorCount: '2',
            bedroomCount: '3',
            doorsByOrientation: { north: '1', south: '1', east: '1', west: '1' },
            windowsByOrientation: { north: '1', south: '1', east: '1', west: '1' },
            windowFrameMaterial: 'pvc',
            doorMaterial: 'Madera',
            windowGlassType: 'doble',
            averageFloorHeight: '2.7-3.2m',
            hasShutters: false,
            shutterWindowCount: '',
          },
        },
      },
    });
    expect(result.status).toBe('pending');
  });

  it('sets needsRegeneration=true when completed but renderedDocument is null', () => {
    const result = getDashboardEnergyCertificateSummary({
      formData: {
        energyCertificate: {
          status: 'completed',
          renderedDocument: null,
          housing: {
            habitableAreaM2: '100',
            floorCount: '2',
            bedroomCount: '3',
            doorsByOrientation: { north: '1', south: '1', east: '1', west: '1' },
            windowsByOrientation: { north: '1', south: '1', east: '1', west: '1' },
            windowFrameMaterial: 'pvc',
            doorMaterial: 'Madera',
            windowGlassType: 'doble',
            averageFloorHeight: '2.7-3.2m',
            hasShutters: false,
            shutterWindowCount: '',
          },
          thermal: {
            thermalInstallationType: 'termo-electrico',
            boilerFuelType: null,
            equipmentDetails: 'Termo 100L',
            hasAirConditioning: false,
            airConditioningType: null,
            airConditioningDetails: '',
            heatingEmitterType: null,
            radiatorMaterial: null,
          },
          additional: {
            soldProduct: 'solo-paneles',
            isExistingCustomer: false,
            hasSolarPanels: false,
            solarPanelDetails: '',
          },
          customerSignature: 'data:image/png;base64,abc',
          completedAt: new Date().toISOString(),
          skippedAt: null,
        },
      },
    });
    if (result.status === 'completed') {
      expect(result.needsRegeneration).toBe(true);
      expect(result.asset).toBeNull();
    }
  });

  it('returns completed with asset when all fields present and renderedDocument has imageDataUrl', () => {
    const project = {
      formData: {
        energyCertificate: {
          status: 'completed',
          renderedDocument: { imageDataUrl: makeDataUrl(), generatedAt: new Date().toISOString(), templateVersion: '1' },
          housing: {
            habitableAreaM2: '100',
            floorCount: '2',
            bedroomCount: '3',
            doorsByOrientation: { north: '1', south: '1', east: '1', west: '1' },
            windowsByOrientation: { north: '1', south: '1', east: '1', west: '1' },
            windowFrameMaterial: 'pvc',
            doorMaterial: 'Madera',
            windowGlassType: 'doble',
            averageFloorHeight: '2.7-3.2m',
            hasShutters: false,
            shutterWindowCount: '',
          },
          thermal: {
            thermalInstallationType: 'termo-electrico',
            boilerFuelType: null,
            equipmentDetails: 'Termo 100L',
            hasAirConditioning: false,
            airConditioningType: null,
            airConditioningDetails: '',
            heatingEmitterType: null,
            radiatorMaterial: null,
          },
          additional: {
            soldProduct: 'solo-paneles',
            isExistingCustomer: false,
            hasSolarPanels: false,
            solarPanelDetails: '',
          },
          customerSignature: 'data:image/png;base64,abc',
          completedAt: new Date().toISOString(),
          skippedAt: null,
        },
      },
    };
    const result = getDashboardEnergyCertificateSummary(project);
    if (result.status === 'completed') {
      expect(result.asset).not.toBeNull();
      expect(result.needsRegeneration).toBe(false);
    }
  });

  it('uses project.summary.energyCertificate when present', () => {
    const result = getDashboardEnergyCertificateSummary({
      summary: { energyCertificate: { status: 'skipped', completedAt: null } },
      formData: {},
    });
    expect(result.status).toBe('skipped');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDashboardFinalSignatureAssets — bad data
// ─────────────────────────────────────────────────────────────────────────────
describe('getDashboardFinalSignatureAssets — bad data', () => {
  it('returns empty array for null project', () => {
    expect(getDashboardFinalSignatureAssets(null)).toEqual([]);
  });

  it('returns empty array when signatures is null', () => {
    expect(getDashboardFinalSignatureAssets({ formData: { signatures: null } })).toEqual([]);
  });

  it('returns empty array when signatures is an empty object', () => {
    expect(getDashboardFinalSignatureAssets({ formData: { signatures: {} } })).toEqual([]);
  });

  it('returns items for present signatures', () => {
    const project = {
      formData: {
        signatures: {
          customerSignature: makeDataUrl(),
          repSignature: makeDataUrl(),
        },
      },
    };
    const items = getDashboardFinalSignatureAssets(project);
    expect(items).toHaveLength(2);
    expect(items[0].key).toBe('customerSignature');
    expect(items[1].key).toBe('repSignature');
  });

  it('returns only present items when one signature is missing', () => {
    const project = {
      formData: {
        signatures: {
          customerSignature: makeDataUrl(),
          repSignature: null,
        },
      },
    };
    const items = getDashboardFinalSignatureAssets(project);
    expect(items).toHaveLength(1);
  });
});

describe('getDashboardPhotoGroups — preview and asset fallback', () => {
  it('returns preview-backed property photo groups when previews exist', () => {
    const groups = getDashboardPhotoGroups({
      formData: {
        roof: {
          photos: [makePhoto()],
        },
      },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('roof');
    expect(groups[0].items[0].dataUrl).toContain('data:image/jpeg');
  });

  it('falls back to uploaded asset paths when photo previews were stripped', () => {
    const groups = getDashboardPhotoGroups({
      formData: {},
      assetFiles: {
        roof_0: '/uploads/assets/ELT001/roof_0.jpg',
        roof_1: '/uploads/assets/ELT001/roof_1.png',
      },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].items[0].dataUrl).toBe('/uploads/assets/ELT001/roof_0.jpg');
    expect(groups[0].items[1].mimeType).toBe('image/png');
  });
});

describe('getDashboardAdditionalBankDocumentAssets', () => {
  it('returns inline and asset-backed additional bank documents with stable labels', () => {
    const assets = getDashboardAdditionalBankDocumentAssets({
      formData: {
        additionalBankDocuments: [
          {
            id: 'ownership',
            type: 'bank-ownership-certificate',
            files: [{
              id: 'ownership-file',
              filename: 'ownership.pdf',
              mimeType: 'application/pdf',
              dataUrl: makeDataUrl('application/pdf'),
              timestamp: 1,
              sizeBytes: 100,
            }],
          },
          {
            id: 'other',
            type: 'other',
            customLabel: 'IRPF 2024',
            files: [{
              id: 'other-file',
              filename: 'irpf.png',
              mimeType: 'image/png',
              dataUrl: '',
              assetKey: 'bank-doc-other',
              timestamp: 1,
              sizeBytes: 100,
            }],
          },
        ],
      },
      assetFiles: {
        'bank-doc-other': '/uploads/assets/ELT001/bank-doc-other.png',
      },
    });

    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({
      label: 'Certificado de titularidad bancaria',
      mimeType: 'application/pdf',
    });
    expect(assets[1]).toMatchObject({
      label: 'IRPF 2024',
      dataUrl: '/uploads/assets/ELT001/bank-doc-other.png',
      mimeType: 'image/png',
    });
  });

  it('adds additional bank documents to quick downloads without affecting document counts', () => {
    const summary = getDashboardProjectSummary({
      formData: {
        additionalBankDocuments: [
          {
            id: 'payroll',
            type: 'payroll',
            files: [{
              id: 'payroll-file',
              filename: 'payroll.pdf',
              mimeType: 'application/pdf',
              dataUrl: makeDataUrl('application/pdf'),
              timestamp: 1,
              sizeBytes: 100,
            }],
          },
        ],
      },
    });

    expect(summary.downloadGroups.some((group) => group.key === 'additional-bank-documents')).toBe(true);
    expect(summary.counts.documentsTotal).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDashboardSignedPdfItems — bad data + deferred
// ─────────────────────────────────────────────────────────────────────────────
describe('getDashboardSignedPdfItems — bad data', () => {
  it('returns items without throwing for null project', () => {
    expect(() => getDashboardSignedPdfItems(null)).not.toThrow();
  });

  it('returns items without throwing for project with no formData', () => {
    expect(() => getDashboardSignedPdfItems({ formData: null })).not.toThrow();
  });

  it('marks status as deferred when signatureDeferred is true', () => {
    const project = {
      formData: { representation: { signatureDeferred: true } },
    };
    const items = getDashboardSignedPdfItems(project);
    const pending = items.filter((i) => !i.present);
    expect(pending.every((i) => i.status === 'deferred')).toBe(true);
  });

  it('marks status as pending when signatureDeferred is false', () => {
    const project = {
      formData: { representation: { signatureDeferred: false } },
    };
    const items = getDashboardSignedPdfItems(project);
    const pending = items.filter((i) => !i.present);
    expect(pending.every((i) => i.status === 'pending')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDashboardProjectSummary — top-level smoke test with bad data
// ─────────────────────────────────────────────────────────────────────────────
describe('getDashboardProjectSummary — bad data resilience', () => {
  it('does not throw for null project', () => {
    expect(() => getDashboardProjectSummary(null)).not.toThrow();
  });

  it('does not throw for empty project object', () => {
    expect(() => getDashboardProjectSummary({})).not.toThrow();
  });

  it('does not throw for project with completely null formData', () => {
    expect(() => getDashboardProjectSummary({ formData: null })).not.toThrow();
  });

  it('returns "—" as customerDisplayName when no name info is available', () => {
    const summary = getDashboardProjectSummary({ formData: null });
    expect(summary.customerDisplayName).toBe('—');
  });

  it('uses customerName from project root when no extraction data available', () => {
    const summary = getDashboardProjectSummary({ customerName: 'Ana García', formData: null });
    expect(summary.customerDisplayName).toBe('Ana García');
  });

  it('counts.documentsRemaining equals documentsTotal - documentsPresent', () => {
    const summary = getDashboardProjectSummary({ formData: null });
    expect(summary.counts.documentsRemaining).toBe(
      summary.counts.documentsTotal - summary.counts.documentsPresent,
    );
  });

  it('emits a titular-mismatch warning when DNI name and EB titular do not share any word', () => {
    const project = {
      formData: {
        dni: {
          front: {
            photo: makePhoto(),
            extraction: makeExtraction({ extractedData: { fullName: 'Juan García López' } }),
          },
          back: null,
          originalPdfs: [],
        },
        electricityBill: {
          pages: [
            {
              photo: makePhoto(),
              extraction: makeExtraction({ extractedData: { titular: 'María Fernández Ruiz' } }),
            },
          ],
          originalPdfs: [],
        },
        ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
        energyCertificate: { status: 'not-started' },
        representation: {},
        signatures: {},
        contract: { originalPdfs: [], extraction: null },
      },
    };
    const summary = getDashboardProjectSummary(project);
    expect(summary.warnings.some((w) => w.key === 'titular-mismatch')).toBe(true);
  });

  it('does NOT emit a titular-mismatch warning when DNI name and EB titular share a word', () => {
    const project = {
      formData: {
        dni: {
          front: {
            photo: makePhoto(),
            extraction: makeExtraction({ extractedData: { fullName: 'Juan García López' } }),
          },
          back: null,
          originalPdfs: [],
        },
        electricityBill: {
          pages: [
            {
              photo: makePhoto(),
              extraction: makeExtraction({ extractedData: { titular: 'García López Juan' } }),
            },
          ],
          originalPdfs: [],
        },
        ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
        energyCertificate: { status: 'not-started' },
        representation: {},
        signatures: {},
        contract: { originalPdfs: [], extraction: null },
      },
    };
    const summary = getDashboardProjectSummary(project);
    expect(summary.warnings.some((w) => w.key === 'titular-mismatch')).toBe(false);
  });
});
