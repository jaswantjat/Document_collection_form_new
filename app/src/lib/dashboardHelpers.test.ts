import { describe, it, expect } from 'vitest';
import { buildProjectUrl } from '@/lib/dashboardHelpers';

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
