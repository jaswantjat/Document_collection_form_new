const test = require('node:test');
const assert = require('node:assert/strict');

const { extractCompletedDocKeys } = require('./formNotificationProjectState');

function makeStrippedPhoto(id) {
  return { id, timestamp: 1, sizeBytes: 1234 };
}

test('extractCompletedDocKeys counts stripped asset-backed uploads as completed documents', () => {
  const keys = extractCompletedDocKeys(
    {
      dni: {
        front: { photo: makeStrippedPhoto('dni-front'), extraction: null },
        back: { photo: null, extraction: null },
      },
      ibi: { photo: null, pages: [], extraction: null },
      electricityBill: {
        pages: [{ photo: makeStrippedPhoto('bill-1'), extraction: null }],
      },
      representation: {
        location: 'cataluna',
        renderedDocuments: {
          catalunaIva: { generatedAt: '2026-04-20T10:00:00Z', templateVersion: 'v1' },
          catalunaGeneralitat: { generatedAt: '2026-04-20T10:00:00Z', templateVersion: 'v1' },
          catalunaRepresentacio: { generatedAt: '2026-04-20T10:00:00Z', templateVersion: 'v1' },
        },
      },
      energyCertificate: { status: 'completed' },
    },
    {
      dniFront: '/uploads/assets/ELT20260077/dniFront.jpg',
      ibi_0: '/uploads/assets/ELT20260077/ibi_0.jpg',
      electricity_0: '/uploads/assets/ELT20260077/electricity_0.jpg',
    }
  );

  assert.deepEqual(keys, [
    'dni_front',
    'ibi',
    'electricity_bill',
    'energy_certificate',
    'cataluna_iva',
    'cataluna_generalitat',
    'cataluna_representacio',
  ]);
});

test('extractCompletedDocKeys preserves previously saved identity uploads when current submit is stripped down to extraction data', () => {
  const keys = extractCompletedDocKeys(
    {
      dni: {
        front: {
          photo: null,
          extraction: { extractedData: { fullName: 'Ana Lopez' } },
        },
        back: {
          photo: null,
          extraction: null,
        },
      },
      ibi: { photo: null, pages: [], extraction: null },
      electricityBill: { pages: [] },
      representation: {
        location: 'madrid',
        renderedDocuments: {
          spainIva: { generatedAt: '2026-04-20T10:00:00Z', templateVersion: 'v1' },
        },
      },
      energyCertificate: { status: 'skipped' },
    },
    {},
    {
      dni: {
        front: { photo: makeStrippedPhoto('existing-front') },
        back: { photo: makeStrippedPhoto('existing-back') },
      },
    }
  );

  assert.deepEqual(keys, [
    'dni_front',
    'dni_back',
    'spain_iva',
  ]);
});

test('extractCompletedDocKeys does not invent completed documents after assets are pruned', () => {
  const keys = extractCompletedDocKeys(
    {
      dni: {
        front: { photo: null, extraction: null },
        back: { photo: null, extraction: null },
      },
      ibi: { photo: null, pages: [], extraction: null },
      electricityBill: { pages: [] },
      representation: {
        location: 'other',
        renderedDocuments: {},
      },
      energyCertificate: { status: 'not-started' },
    },
    {}
  );

  assert.deepEqual(keys, []);
});
