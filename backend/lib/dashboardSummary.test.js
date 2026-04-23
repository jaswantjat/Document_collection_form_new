const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDashboardSummary } = require('./dashboardSummary');

function makeStrippedPhoto(id) {
  return { id, timestamp: 1, sizeBytes: 1000 };
}

test('buildDashboardSummary does not mark stripped submitted documents as present without a downloadable file', () => {
  const summary = buildDashboardSummary({
    code: 'ELT20260069',
    customerName: 'SERGIO CAPARROS RUIZ',
    formData: {
      dni: {
        front: {
          photo: makeStrippedPhoto('dni-front'),
          extraction: { extractedData: { fullName: 'SERGIO CAPARROS RUIZ' } },
        },
        back: {
          photo: makeStrippedPhoto('dni-back'),
          extraction: { extractedData: { address: 'LES PERDIUS 13' } },
        },
        originalPdfs: [],
      },
      ibi: {
        photo: null,
        pages: [makeStrippedPhoto('ibi-1')],
        extraction: null,
        originalPdfs: [],
      },
      electricityBill: {
        pages: [
          {
            photo: makeStrippedPhoto('bill-1'),
            extraction: { extractedData: { titular: 'SERGIO CAPARROS RUIZ' } },
          },
        ],
        originalPdfs: [],
      },
      representation: {
        location: 'cataluna',
        renderedDocuments: {
          catalunaIva: { generatedAt: '2026-04-20T16:50:51.331Z', templateVersion: '2026-04-04.2' },
          catalunaGeneralitat: { generatedAt: '2026-04-20T16:50:51.331Z', templateVersion: '2026-04-04.2' },
          catalunaRepresentacio: { generatedAt: '2026-04-20T16:50:51.331Z', templateVersion: '2026-04-04.2' },
        },
      },
      signatures: {},
      energyCertificate: { status: 'not-started' },
      contract: { extraction: null, originalPdfs: [] },
    },
    assetFiles: {
      electricityOriginal_0: '/uploads/assets/ELT20260069/electricityOriginal_0.pdf',
    },
  });

  assert.equal(summary.documents.find((item) => item.key === 'dniFront')?.present, false);
  assert.equal(summary.documents.find((item) => item.key === 'dniBack')?.present, false);
  assert.equal(summary.documents.find((item) => item.key === 'ibi')?.present, false);
  assert.equal(summary.electricityPages[0]?.present, true);
  assert.equal(summary.signedDocuments.every((item) => item.present), true);
  assert.deepEqual(summary.counts, {
    documentsPresent: 1,
    documentsTotal: 4,
    manualReview: 0,
    signedFormsPresent: 3,
    signedFormsTotal: 3,
    pdfsAvailable: 3,
    pdfsTotal: 3,
    energyCertificatePresent: false,
    energyCertificateTotal: 1,
    finalSignaturesPresent: 0,
    finalSignaturesTotal: 0,
    documentsRemaining: 3,
  });
});

test('buildDashboardSummary keeps stripped submitted documents present when original PDFs survive', () => {
  const summary = buildDashboardSummary({
    code: 'ELT20260079',
    customerName: 'Cliente PDF',
    formData: {
      dni: {
        front: {
          photo: makeStrippedPhoto('dni-front'),
          extraction: { extractedData: { fullName: 'CLIENTE PDF' } },
        },
        back: {
          photo: makeStrippedPhoto('dni-back'),
          extraction: { extractedData: { address: 'CALLE FALSA 123' } },
        },
        originalPdfs: [],
      },
      ibi: {
        photo: null,
        pages: [makeStrippedPhoto('ibi-1')],
        originalPdfs: [],
        extraction: { extractedData: { titular: 'CLIENTE PDF' } },
      },
      electricityBill: {
        pages: [{ photo: makeStrippedPhoto('bill-1'), extraction: null }],
        originalPdfs: [],
      },
      representation: {},
      signatures: {},
      energyCertificate: { status: 'not-started' },
      contract: { extraction: null, originalPdfs: [] },
    },
    assetFiles: {
      dniOriginal_0: '/uploads/assets/ELT20260079/dniOriginal_0.pdf',
      ibiOriginal_0: '/uploads/assets/ELT20260079/ibiOriginal_0.pdf',
      electricityOriginal_0: '/uploads/assets/ELT20260079/electricityOriginal_0.pdf',
    },
  });

  assert.equal(summary.documents.find((item) => item.key === 'dniFront')?.present, true);
  assert.equal(summary.documents.find((item) => item.key === 'dniBack')?.present, true);
  assert.equal(summary.documents.find((item) => item.key === 'ibi')?.present, true);
  assert.equal(summary.electricityPages[0]?.present, true);
});

test('buildDashboardSummary keeps signed documents present when only rendered document metadata survives submit', () => {
  const summary = buildDashboardSummary({
    code: 'ELT20260070',
    customerName: 'Cliente',
    formData: {
      dni: {
        front: { photo: null, extraction: null },
        back: { photo: null, extraction: null },
        originalPdfs: [],
      },
      ibi: {
        photo: null,
        pages: [],
        extraction: null,
        originalPdfs: [],
      },
      electricityBill: {
        pages: [],
        originalPdfs: [],
      },
      representation: {
        location: 'madrid',
        renderedDocuments: {
          spainIva: { generatedAt: '2026-04-20T16:50:51.331Z', templateVersion: '2026-04-04.2' },
          spainPoder: { generatedAt: '2026-04-20T16:50:51.331Z', templateVersion: '2026-04-04.2' },
        },
      },
      signatures: {},
      energyCertificate: { status: 'not-started' },
      contract: { extraction: null, originalPdfs: [] },
    },
    assetFiles: {},
  });

  assert.deepEqual(
    summary.signedDocuments.map((item) => ({ key: item.key, present: item.present, status: item.status })),
    [
      { key: 'spain-iva', present: true, status: 'complete' },
      { key: 'spain-poder', present: true, status: 'complete' },
    ]
  );
});

test('buildDashboardSummary keeps completed energy certificates completed when heating type is omitted', () => {
  const summary = buildDashboardSummary({
    code: 'ELT20260071',
    customerName: 'Cliente',
    formData: {
      dni: {
        front: { photo: null, extraction: null },
        back: { photo: null, extraction: null },
        originalPdfs: [],
      },
      ibi: {
        photo: null,
        pages: [],
        extraction: null,
        originalPdfs: [],
      },
      electricityBill: {
        pages: [],
        originalPdfs: [],
      },
      representation: {
        location: 'other',
        renderedDocuments: {},
      },
      signatures: {},
      contract: { extraction: null, originalPdfs: [] },
      energyCertificate: {
        status: 'completed',
        housing: {
          cadastralReference: '',
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
          thermalInstallationType: 'caldera',
          boilerFuelType: 'gas',
          equipmentDetails: 'Caldera 2022',
          hasAirConditioning: false,
          airConditioningType: null,
          airConditioningDetails: '',
          heatingEmitterType: null,
          radiatorMaterial: null,
          tipoFase: 'monofasica',
          tipoFaseConfirmed: true,
        },
        additional: {
          soldProduct: 'solo-paneles',
          isExistingCustomer: false,
          hasSolarPanels: false,
          solarPanelDetails: '',
        },
        customerSignature: null,
        renderedDocument: null,
        completedAt: '2026-04-21T08:00:00.000Z',
        skippedAt: null,
      },
    },
    assetFiles: {},
  });

  assert.equal(summary.energyCertificate.status, 'completed');
  assert.equal(summary.counts.energyCertificatePresent, true);
});
