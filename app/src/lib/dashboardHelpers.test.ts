import { describe, it, expect } from 'vitest';
import {
  buildProjectUrl,
  getDocumentAssetsFromProject,
  getElectricityAssetsFromProject,
  getTableDniAssetsFromProject,
  getTableDocumentAssetsFromProject,
  getTableElectricityAssetsFromProject,
} from '@/lib/dashboardHelpers';

describe('buildProjectUrl', () => {
  it('builds a customer link with the project code only', () => {
    expect(buildProjectUrl('ELT20250001', 'customer', 'customer-token-20250001')).toBe(
      '/?code=ELT20250001'
    );
  });

  it('keeps the assessor source flag when building an assessor link', () => {
    expect(buildProjectUrl('ELT20250001', 'assessor', 'customer-token-20250001')).toBe(
      '/?code=ELT20250001&source=assessor'
    );
  });
});

describe('asset-backed dashboard helpers', () => {
  it('preserves png mime types for stored primary document assets', () => {
    const assets = getDocumentAssetsFromProject({
      formData: null,
      assetFiles: {
        dniFront: '/uploads/assets/ELT001/dniFront.png',
      },
    }, 'dniFront');

    expect(assets).toEqual([
      expect.objectContaining({
        dataUrl: '/uploads/assets/ELT001/dniFront.png',
        mimeType: 'image/png',
      }),
    ]);
  });

  it('preserves png mime types for stored electricity assets', () => {
    const assets = getElectricityAssetsFromProject({
      formData: null,
      assetFiles: {
        electricity_0: '/uploads/assets/ELT001/electricity_0.png',
      },
    });

    expect(assets).toEqual([
      expect.objectContaining({
        dataUrl: '/uploads/assets/ELT001/electricity_0.png',
        mimeType: 'image/png',
      }),
    ]);
  });

  it('falls back to stored original PDFs for table document actions', () => {
    const assets = getTableDocumentAssetsFromProject({
      formData: {
        ibi: {
          pages: [{ id: 'ibi-1', timestamp: 1, sizeBytes: 100 }],
          originalPdfs: [],
        },
      },
      assetFiles: {
        ibiOriginal_0: '/uploads/assets/ELT001/ibiOriginal_0.pdf',
      },
    }, 'ibi');

    expect(assets).toEqual([
      expect.objectContaining({
        dataUrl: '/uploads/assets/ELT001/ibiOriginal_0.pdf',
        label: 'IBI original PDF',
        mimeType: 'application/pdf',
      }),
    ]);
  });

  it('dedupes DNI original PDF fallbacks for combined table actions', () => {
    const assets = getTableDniAssetsFromProject({
      formData: {
        dni: {
          front: { photo: { id: 'front', timestamp: 1, sizeBytes: 100 }, extraction: null },
          back: { photo: { id: 'back', timestamp: 1, sizeBytes: 100 }, extraction: null },
          originalPdfs: [],
        },
      },
      assetFiles: {
        dniOriginal_0: '/uploads/assets/ELT001/dniOriginal_0.pdf',
      },
    }, { includeFront: true, includeBack: true });

    expect(assets).toHaveLength(1);
    expect(assets[0]).toEqual(expect.objectContaining({
      dataUrl: '/uploads/assets/ELT001/dniOriginal_0.pdf',
      mimeType: 'application/pdf',
    }));
  });

  it('falls back to stored original PDFs for table electricity actions', () => {
    const assets = getTableElectricityAssetsFromProject({
      formData: {
        electricityBill: {
          pages: [{ photo: { id: 'bill-1', timestamp: 1, sizeBytes: 100 }, extraction: null }],
          originalPdfs: [],
        },
      },
      assetFiles: {
        electricityOriginal_0: '/uploads/assets/ELT001/electricityOriginal_0.pdf',
      },
    });

    expect(assets).toEqual([
      expect.objectContaining({
        dataUrl: '/uploads/assets/ELT001/electricityOriginal_0.pdf',
        label: 'Factura luz original PDF',
        mimeType: 'application/pdf',
      }),
    ]);
  });
});
