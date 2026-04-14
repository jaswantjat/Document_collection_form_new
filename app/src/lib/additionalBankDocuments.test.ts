import { describe, expect, it } from 'vitest';

import {
  getAdditionalBankDocumentLabel,
  normalizeAdditionalBankDocuments,
  withAdditionalBankDocumentAssetKeys,
} from '@/lib/additionalBankDocuments';
import { getAdditionalBankDocumentSummaryRows } from '@/lib/additionalBankDocumentProcessing';

describe('withAdditionalBankDocumentAssetKeys', () => {
  it('assigns stable sequential asset keys across all files', () => {
    const documents = withAdditionalBankDocumentAssetKeys([
      {
        id: 'ownership',
        type: 'bank-ownership-certificate',
        files: [
          {
            id: 'ownership-file',
            filename: 'ownership.pdf',
            mimeType: 'application/pdf',
            dataUrl: 'data:application/pdf;base64,AAA=',
            timestamp: 1,
            sizeBytes: 100,
          },
        ],
      },
      {
        id: 'other',
        type: 'other',
        customLabel: 'IRPF 2024',
        files: [
          {
            id: 'other-file-1',
            filename: 'irpf-1.pdf',
            mimeType: 'application/pdf',
            dataUrl: 'data:application/pdf;base64,BBB=',
            timestamp: 2,
            sizeBytes: 120,
          },
          {
            id: 'other-file-2',
            filename: 'irpf-2.pdf',
            mimeType: 'application/pdf',
            dataUrl: 'data:application/pdf;base64,CCC=',
            timestamp: 3,
            sizeBytes: 140,
          },
        ],
      },
    ]);

    expect(documents[0].files[0].assetKey).toBe('bankDocument_0');
    expect(documents[1].files[0].assetKey).toBe('bankDocument_1');
    expect(documents[1].files[1].assetKey).toBe('bankDocument_2');
  });

  it('uses the free-text label for other documents', () => {
    const [entry] = withAdditionalBankDocumentAssetKeys([
      {
        id: 'other',
        type: 'other',
        customLabel: 'Modelo 100',
        files: [],
      },
    ]);

    expect(getAdditionalBankDocumentLabel(entry)).toBe('Modelo 100');
  });

  it('preserves extraction and issue metadata when normalizing saved entries', () => {
    const [entry] = normalizeAdditionalBankDocuments([{
      id: 'payroll-1',
      type: 'payroll',
      files: [],
      extraction: {
        extractedData: { holderName: 'Ana Pérez', amount: '1250 EUR' },
        confidence: 0.91,
        isCorrectDocument: true,
        documentTypeDetected: 'Payroll',
        needsManualReview: false,
        confirmedByUser: true,
      },
      issue: {
        code: 'manual-review',
        message: 'Revísalo',
        updatedAt: '2026-04-14T09:00:00Z',
      },
    }]);

    expect(entry.extraction?.extractedData.holderName).toBe('Ana Pérez');
    expect(entry.issue?.code).toBe('manual-review');
  });
});

describe('getAdditionalBankDocumentSummaryRows', () => {
  it('returns the configured payroll summary fields', () => {
    const rows = getAdditionalBankDocumentSummaryRows({
      id: 'payroll-2',
      type: 'payroll',
      files: [],
      extraction: {
        extractedData: {
          holderName: 'Ana Pérez',
          issuerName: 'Empresa Demo',
          period: 'Marzo 2026',
          amount: '1.250 EUR',
        },
        confidence: 0.95,
        isCorrectDocument: true,
        documentTypeDetected: 'Payroll',
        needsManualReview: false,
        confirmedByUser: true,
      },
      issue: null,
    });

    expect(rows).toEqual([
      { label: 'Titular', value: 'Ana Pérez' },
      { label: 'Empresa', value: 'Empresa Demo' },
      { label: 'Periodo', value: 'Marzo 2026' },
      { label: 'Importe neto', value: '1.250 EUR' },
    ]);
  });
});
