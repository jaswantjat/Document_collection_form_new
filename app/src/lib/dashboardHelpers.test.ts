import { describe, it, expect } from 'vitest';
import {
  buildProjectUrl,
  getDocumentAssetsFromProject,
  getElectricityAssetsFromProject,
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
});
