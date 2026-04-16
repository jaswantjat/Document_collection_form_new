import { describe, expect, it, vi } from 'vitest';

import { buildDashboardAdditionalBankDocumentPatch } from '@/lib/dashboardAdditionalBankDocuments';
import { buildValidatedAdditionalBankDocumentEntry } from '@/lib/additionalBankDocumentProcessing';

vi.mock('@/lib/additionalBankDocumentProcessing', () => ({
  buildValidatedAdditionalBankDocumentEntry: vi.fn(),
}));

describe('buildDashboardAdditionalBankDocumentPatch', () => {
  it('appends each uploaded file as its own generic additional-document entry and reassigns asset keys', async () => {
    vi.mocked(buildValidatedAdditionalBankDocumentEntry).mockImplementation(async ([file], _type, _label, id) => ({
      id,
      type: 'other',
      files: [{
        id: `${file.name}-file`,
        filename: file.name,
        mimeType: file.type,
        dataUrl: 'data:application/pdf;base64,QQ==',
        timestamp: 1,
        sizeBytes: file.size,
      }],
      extraction: null,
      issue: null,
    }));

    const patch = await buildDashboardAdditionalBankDocumentPatch([
      {
        id: 'existing',
        type: 'other',
        files: [{
          id: 'existing-file',
          filename: 'existing.pdf',
          mimeType: 'application/pdf',
          dataUrl: 'data:application/pdf;base64,QQ==',
          timestamp: 1,
          sizeBytes: 10,
        }],
      },
    ], [
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['second'], 'second.jpg', { type: 'image/jpeg' }),
    ]);

    expect(buildValidatedAdditionalBankDocumentEntry).toHaveBeenCalledTimes(2);
    expect(patch.additionalBankDocuments).toHaveLength(3);
    expect(patch.additionalBankDocuments.map((entry) => entry.files[0]?.assetKey)).toEqual([
      'bankDocument_0',
      'bankDocument_1',
      'bankDocument_2',
    ]);
    expect(patch.additionalBankDocuments.at(-1)?.files[0]?.filename).toBe('second.jpg');
  });
});
