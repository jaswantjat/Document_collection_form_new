import { describe, expect, it } from 'vitest';
import { normalizeFormData } from './formDataNormalization';
import { mergeProjectWithDeviceBackup } from './projectBackupMerge';
import type { FormData, ProjectData } from '@/types';

function makeProject(formData: unknown): ProjectData {
  return {
    code: 'ELT20260083',
    customerName: 'Test Customer',
    phone: '+34600000000',
    email: '',
    productType: 'solar',
    assessor: 'Antonio Miguel Sorroche Martínez',
    assessorId: '',
    formData: formData as FormData,
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

describe('normalizeFormData', () => {
  it('normalizes malformed local drafts into render-safe form data', () => {
    const normalized = normalizeFormData({
      dni: {
        front: { photo: 'not-a-photo', extraction: { extractedData: 'bad' } },
        originalPdfs: { bad: true },
      },
      ibi: {
        photo: { id: 'ibi-1', preview: 'data:image/jpeg;base64,a', timestamp: 1 },
        pages: { bad: true },
        originalPdfs: 'bad',
      },
      electricityBill: {
        pages: { bad: true },
        front: { photo: { id: 'front-1', preview: 'data:image/jpeg;base64,b' } },
        originalPdfs: null,
      },
      representation: {
        companyName: { bad: true },
        renderedDocuments: 'bad',
      },
      energyCertificate: {
        status: 'completed',
        housing: { doorsByOrientation: 'bad', windowsByOrientation: null },
      },
    });

    expect(normalized.dni.front.photo).toBeNull();
    expect(normalized.dni.originalPdfs).toEqual([]);
    expect(normalized.ibi.pages).toHaveLength(1);
    expect(normalized.electricityBill.pages).toHaveLength(1);
    expect(normalized.representation.companyName).toBe('');
    expect(normalized.representation.renderedDocuments).toEqual({});
    expect(normalized.energyCertificate.housing.doorsByOrientation).toMatchObject({
      north: '0',
      east: '0',
      south: '0',
      west: '0',
    });
  });

  it('lets device-backup merge ignore malformed backup arrays instead of throwing', () => {
    const serverProject = makeProject({
      ibi: {
        photo: { id: 'server-ibi', preview: '', timestamp: 1, sizeBytes: 1 },
        pages: [{ id: 'server-ibi', preview: '', timestamp: 1, sizeBytes: 1 }],
      },
      electricityBill: { pages: [] },
    });

    expect(() =>
      mergeProjectWithDeviceBackup(serverProject, {
        ibi: { pages: { bad: true }, originalPdfs: { bad: true } },
        electricityBill: { pages: { bad: true }, originalPdfs: { bad: true } },
        dni: { originalPdfs: { bad: true } },
      } as unknown as FormData)
    ).not.toThrow();
  });
});
