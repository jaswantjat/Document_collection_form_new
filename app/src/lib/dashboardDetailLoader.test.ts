import { describe, expect, it, vi } from 'vitest';
import { createDashboardProjectDetailLoader } from './dashboardDetailLoader';

describe('createDashboardProjectDetailLoader', () => {
  it('reuses cached detail after the first successful load', async () => {
    const fetchProject = vi.fn().mockResolvedValue({
      success: true,
      project: { code: 'ELT001', customerName: 'Ana' },
    });

    const loader = createDashboardProjectDetailLoader({
      fetchProject,
      isAuthError: () => false,
      onAuthError: vi.fn(),
    });

    const first = await loader.loadProjectDetail('ELT001');
    const second = await loader.loadProjectDetail('ELT001');

    expect(first).toEqual(second);
    expect(fetchProject).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent requests for the same project code', async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    const fetchProject = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const loader = createDashboardProjectDetailLoader({
      fetchProject,
      isAuthError: () => false,
      onAuthError: vi.fn(),
    });

    const first = loader.loadProjectDetail('ELT002');
    const second = loader.loadProjectDetail('ELT002');

    expect(fetchProject).toHaveBeenCalledTimes(1);

    resolveFetch?.({
      success: true,
      project: { code: 'ELT002', customerName: 'Maria' },
    });

    await expect(first).resolves.toEqual({ code: 'ELT002', customerName: 'Maria' });
    await expect(second).resolves.toEqual({ code: 'ELT002', customerName: 'Maria' });
  });

  it('clears failed in-flight requests so the next load can retry', async () => {
    const fetchProject = vi.fn()
      .mockResolvedValueOnce({ success: false, message: 'temporary failure' })
      .mockResolvedValueOnce({ success: true, project: { code: 'ELT003' } });

    const loader = createDashboardProjectDetailLoader({
      fetchProject,
      isAuthError: () => false,
      onAuthError: vi.fn(),
    });

    await expect(loader.loadProjectDetail('ELT003')).rejects.toThrow('temporary failure');
    await expect(loader.loadProjectDetail('ELT003')).resolves.toEqual({ code: 'ELT003' });
    expect(fetchProject).toHaveBeenCalledTimes(2);
  });

  it('runs the auth handler before rejecting on auth errors', async () => {
    const onAuthError = vi.fn().mockResolvedValue(undefined);
    const loader = createDashboardProjectDetailLoader({
      fetchProject: vi.fn().mockResolvedValue({ success: false, error: 'SESSION_EXPIRED' }),
      isAuthError: (error) => error === 'SESSION_EXPIRED',
      onAuthError,
    });

    await expect(loader.loadProjectDetail('ELT004')).rejects.toThrow('SESSION_EXPIRED');
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });
});
