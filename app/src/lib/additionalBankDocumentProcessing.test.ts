import { describe, expect, it, vi } from 'vitest';

import { buildValidatedAdditionalBankDocumentEntry } from '@/lib/additionalBankDocumentProcessing';
import { createStoredDocumentFile } from '@/lib/photoValidation';

vi.mock('@/lib/photoValidation', () => ({
  createStoredDocumentFile: vi.fn(),
}));

describe('buildValidatedAdditionalBankDocumentEntry', () => {
  it('stores additional documents directly without AI extraction metadata', async () => {
    vi.mocked(createStoredDocumentFile).mockImplementation(async (file: File) => ({
      id: `stored-${file.name}`,
      filename: file.name,
      mimeType: file.type,
      dataUrl: `data:${file.type};base64,QQ==`,
      timestamp: 1,
      sizeBytes: file.size,
    }));

    const entry = await buildValidatedAdditionalBankDocumentEntry(
      [
        new File(['first'], 'first.pdf', { type: 'application/pdf' }),
        new File(['second'], 'second.jpg', { type: 'image/jpeg' }),
      ],
      'other',
      '',
      'entry-1',
    );

    expect(createStoredDocumentFile).toHaveBeenCalledTimes(2);
    expect(entry).toMatchObject({
      id: 'entry-1',
      type: 'other',
      extraction: null,
      issue: null,
    });
    expect(entry.files.map((file) => file.filename)).toEqual(['first.pdf', 'second.jpg']);
  });
});
