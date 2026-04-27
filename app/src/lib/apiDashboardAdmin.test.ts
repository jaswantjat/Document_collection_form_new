import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminUpdateFormData,
  deleteProject,
  updateDashboardProjectAssessor,
} from '@/services/api';

function mockFetch(body: unknown, status = 200) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    blob: vi.fn().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' })),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

if (!globalThis.AbortSignal?.timeout) {
  vi.stubGlobal('AbortSignal', {
    timeout: vi.fn().mockReturnValue({ aborted: false } as AbortSignal),
    abort: vi.fn().mockReturnValue({ aborted: true } as AbortSignal),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('updateDashboardProjectAssessor', () => {
  it('patches the inline assessor endpoint with the dashboard token', async () => {
    mockFetch({ success: true, project: { code: 'ELT001', assessor: 'Laura Martín Manzano' } });

    const result = await updateDashboardProjectAssessor(
      'ELT001',
      'Laura Martín Manzano',
      'dash-token'
    );

    expect(result.success).toBe(true);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][0]).toContain('/api/dashboard/project/ELT001/assessor');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-token': 'dash-token',
      },
      body: JSON.stringify({ assessor: 'Laura Martín Manzano' }),
    });
  });

  it('returns backend validation errors for disallowed assessor reassignment', async () => {
    mockFetch({ success: false, message: 'Selecciona un asesor de la lista aprobada.' }, 400);

    const result = await updateDashboardProjectAssessor('ELT001', 'QA Bot', 'dash-token');

    expect(result.success).toBe(false);
    expect(result.message).toContain('asesor');
  });
});

describe('deleteProject', () => {
  it('uses DELETE with the dashboard token and encoded project code', async () => {
    mockFetch({ success: true });

    const result = await deleteProject('ELT/001', 'my-admin-token');

    expect(result.success).toBe(true);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('ELT%2F001');
    expect(String(calledUrl)).not.toContain('ELT/001');
    expect(options.method).toBe('DELETE');
    expect(options.headers['x-dashboard-token']).toBe('my-admin-token');
  });

  it('uses a bounded request timeout', async () => {
    const timeoutSpy = vi.spyOn(globalThis.AbortSignal, 'timeout');
    mockFetch({ success: true });

    await deleteProject('ELT001', 'tok');

    expect(timeoutSpy).toHaveBeenCalledWith(15000);
  });
});

describe('adminUpdateFormData', () => {
  it('sends the dashboard token and JSON patch body', async () => {
    mockFetch({ success: true, formData: { dni: {} } });

    await adminUpdateFormData('ELT001', { dni: { front: null } }, 'dash-token');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [calledUrl, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(String(calledUrl)).toContain('/api/project/ELT001/admin-formdata');
    expect(options.headers['x-dashboard-token']).toBe('dash-token');
    expect(body.formDataPatch).toEqual({ dni: { front: null } });
  });

  it('uses a bounded request timeout', async () => {
    const timeoutSpy = vi.spyOn(globalThis.AbortSignal, 'timeout');
    mockFetch({ success: true, formData: {} });

    await adminUpdateFormData('ELT001', { dni: { front: null } }, 'dash-token');

    expect(timeoutSpy).toHaveBeenCalledWith(15000);
  });
});
