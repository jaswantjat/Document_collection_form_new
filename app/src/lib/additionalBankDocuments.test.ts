import { describe, expect, it } from 'vitest';

import {
  getAdditionalBankDocumentLabel,
  withAdditionalBankDocumentAssetKeys,
} from '@/lib/additionalBankDocuments';

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
});
