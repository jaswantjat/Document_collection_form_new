import { describe, expect, it } from 'vitest';
import { getDashboardProgressState, hasDashboardProgress } from './dashboardProgress';
import { getDashboardProjectSummary } from './dashboardProject';

function makePhoto() {
  return {
    id: 'photo-1',
    preview: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/',
    timestamp: 1,
    sizeBytes: 100,
  };
}

describe('dashboard progress state', () => {
  it('marks untouched projects as pending', () => {
    const summary = getDashboardProjectSummary({ formData: null });

    expect(hasDashboardProgress(summary)).toBe(false);
    expect(getDashboardProgressState({ submissionCount: 0, summary })).toBe('pending');
  });

  it('marks partially completed projects as in-progress', () => {
    const summary = getDashboardProjectSummary({
      formData: {
        dni: {
          front: { photo: makePhoto(), extraction: null },
          back: { photo: null, extraction: null },
          originalPdfs: [],
        },
        ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
        electricityBill: { pages: [], originalPdfs: [] },
        representation: {},
        signatures: {},
        contract: { originalPdfs: [], extraction: null },
      },
    });

    expect(hasDashboardProgress(summary)).toBe(true);
    expect(getDashboardProgressState({ submissionCount: 0, summary })).toBe('in-progress');
  });

  it('keeps submitted projects in the submitted bucket', () => {
    const summary = getDashboardProjectSummary({ formData: null });

    expect(getDashboardProgressState({ submissionCount: 2, summary })).toBe('submitted');
  });
});
