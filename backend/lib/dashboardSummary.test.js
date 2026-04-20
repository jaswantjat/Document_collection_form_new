const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDashboardSummary } = require('./dashboardSummary');

function makeStrippedPhoto(id) {
  return { id, timestamp: 1, sizeBytes: 1000 };
}

test('buildDashboardSummary counts stripped submitted documents as present without preview data', () => {
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

  assert.equal(summary.documents.find((item) => item.key === 'dniFront')?.present, true);
  assert.equal(summary.documents.find((item) => item.key === 'dniBack')?.present, true);
  assert.equal(summary.documents.find((item) => item.key === 'ibi')?.present, true);
  assert.equal(summary.electricityPages[0]?.present, true);
  assert.equal(summary.signedDocuments.every((item) => item.present), true);
  assert.deepEqual(summary.counts, {
    documentsPresent: 4,
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
    documentsRemaining: 0,
  });
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
