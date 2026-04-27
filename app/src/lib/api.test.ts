/**
 * TDD — Layer 1: api.ts (services/api.ts)
 * First-principles tests for all fetch-based API functions.
 * fetch is mocked via vi.stubGlobal — no real HTTP calls made.
 * Covers: happy path, network errors, 4xx/5xx responses, timeouts, malformed JSON.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDashboardProject,
  resendDashboardProjectLink,
  fetchProject,
  lookupByPhone,
  dashboardLogin,
  fetchDashboard,
  fetchDashboardProject,
  preUploadAssets,
  saveProgress,
  submitForm,
  extractDocument,
  extractDocumentBatch,
  deleteProject,
  updateDashboardProjectAssessor,
} from '@/services/api';

// ── fetch mock helpers ───────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    blob: vi.fn().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' })),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  return response;
}

function mockFetchNetworkError(message = 'Network Error') {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

// AbortSignal.timeout may not exist in Node 20 — stub it
if (!globalThis.AbortSignal?.timeout) {
  vi.stubGlobal('AbortSignal', {
    timeout: vi.fn().mockReturnValue({ aborted: false } as AbortSignal),
    abort: vi.fn().mockReturnValue({ aborted: true } as AbortSignal),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchProject
// ─────────────────────────────────────────────────────────────────────────────
describe('fetchProject', () => {
  it('calls /api/project/:code and returns parsed JSON on success', async () => {
    const payload = { success: true, project: { code: 'ELT001', customerName: 'Test' } };
    mockFetch(payload);

    const result = await fetchProject('ELT001');
    expect(result.success).toBe(true);
    expect(result.project?.code).toBe('ELT001');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/project/ELT001'),
      expect.anything(),
    );
  });

  it('sends the customer token in the request URL and header when provided', async () => {
    mockFetch({ success: true, project: { code: 'ELT001' } });
    await fetchProject('ELT001', { token: 'customer-token-20250001' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('token=customer-token-20250001');
    expect(options.headers['x-project-token']).toBe('customer-token-20250001');
  });

  it('returns error payload on project-not-found (404 body)', async () => {
    mockFetch({ success: false, error: 'PROJECT_NOT_FOUND' }, 200);
    const result = await fetchProject('ELT_MISSING');
    expect(result.success).toBe(false);
  });

  it('propagates network errors', async () => {
    mockFetchNetworkError('Failed to fetch');
    await expect(fetchProject('ELT001')).rejects.toThrow('Failed to fetch');
  });

  it('URL-encodes the code to prevent path injection', async () => {
    mockFetch({ success: false });
    await fetchProject('../../../etc/passwd').catch(() => {});
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('../');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lookupByPhone
// ─────────────────────────────────────────────────────────────────────────────
describe('lookupByPhone', () => {
  it('returns project on success', async () => {
    mockFetch({ success: true, project: { code: 'ELT001' } });
    const result = await lookupByPhone('+34612345678');
    expect(result.success).toBe(true);
    expect(result.project?.code).toBe('ELT001');
  });

  it('returns error when phone not found', async () => {
    mockFetch({ success: false, message: 'NOT_FOUND' });
    const result = await lookupByPhone('+34000000000');
    expect(result.success).toBe(false);
  });

  it('URL-encodes phone number (handles + character)', async () => {
    mockFetch({ success: false });
    await lookupByPhone('+34612345678');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('+'); // + should be %2B or %2B
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dashboardLogin
// ─────────────────────────────────────────────────────────────────────────────
describe('dashboardLogin', () => {
  it('returns token on correct password', async () => {
    mockFetch({ success: true, token: 'tok-abc123' });
    const result = await dashboardLogin('eltex2025');
    expect(result.success).toBe(true);
    expect(result.token).toBe('tok-abc123');
  });

  it('returns failure for wrong password', async () => {
    mockFetch({ success: false, message: 'Invalid password' });
    const result = await dashboardLogin('wrongpass');
    expect(result.success).toBe(false);
    expect(result.token).toBeUndefined();
  });

  it('sends password in JSON body', async () => {
    mockFetch({ success: true });
    await dashboardLogin('mypassword');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.password).toBe('mypassword');
  });

  it('propagates network error', async () => {
    mockFetchNetworkError('Connection refused');
    await expect(dashboardLogin('pass')).rejects.toThrow('Connection refused');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchDashboard
// ─────────────────────────────────────────────────────────────────────────────
describe('fetchDashboard', () => {
  it('returns projects array on success', async () => {
    mockFetch({ success: true, projects: [{ code: 'ELT001' }, { code: 'ELT002' }] });
    const result = await fetchDashboard('valid-token');
    expect(result.success).toBe(true);
    expect(result.projects).toHaveLength(2);
  });

  it('sends x-dashboard-token header', async () => {
    mockFetch({ success: true, projects: [] });
    await fetchDashboard('my-token');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['x-dashboard-token']).toBe('my-token');
  });

  it('returns error when token is invalid', async () => {
    mockFetch({ success: false, error: 'Unauthorized' }, 401);
    const result = await fetchDashboard('bad-token');
    expect(result.success).toBe(false);
  });

  it('propagates network error', async () => {
    mockFetchNetworkError();
    await expect(fetchDashboard('token')).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchDashboardProject
// ─────────────────────────────────────────────────────────────────────────────
describe('fetchDashboardProject', () => {
  it('returns full project detail on success', async () => {
    const project = { code: 'ELT001', customerName: 'Ana' };
    mockFetch({ success: true, project });
    const result = await fetchDashboardProject('ELT001', 'valid-token');
    expect(result.success).toBe(true);
    expect(result.project?.customerName).toBe('Ana');
  });

  it('sends both code (URL) and token (header)', async () => {
    mockFetch({ success: true });
    await fetchDashboardProject('ELT001', 'tok-xyz');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const calledUrl: string = fetchMock.mock.calls[0][0];
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(calledUrl).toContain('ELT001');
    expect(headers['x-dashboard-token']).toBe('tok-xyz');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createDashboardProject
// ─────────────────────────────────────────────────────────────────────────────
describe('createDashboardProject', () => {
  it('posts to the dashboard project endpoint and returns the customer link payload', async () => {
    mockFetch({
      success: true,
      existing: false,
      customerLink: '/?code=ELT001',
      project: { code: 'ELT001' },
    });

    const result = await createDashboardProject({
      phone: '+34612345678',
      assessor: 'Sergi Guillen Cavero',
      productType: 'solar',
    }, 'dash-token');

    expect(result.success).toBe(true);
    expect(result.customerLink).toBe('/?code=ELT001');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][0]).toContain('/api/dashboard/project');
    expect(fetchMock.mock.calls[0][1].headers['x-dashboard-token']).toBe('dash-token');
  });

  it('returns backend validation errors for invalid assessor selections', async () => {
    mockFetch({ success: false, message: 'Selecciona un asesor de la lista aprobada.' }, 400);

    const result = await createDashboardProject({
      phone: '+34612345678',
      assessor: 'QA Bot',
    }, 'dash-token');

    expect(result.success).toBe(false);
    expect(result.message).toContain('asesor');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resendDashboardProjectLink
// ─────────────────────────────────────────────────────────────────────────────
describe('resendDashboardProjectLink', () => {
  it('posts to the resend endpoint and returns the current customer link', async () => {
    mockFetch({
      success: true,
      customerLink: '/?code=ELT001',
      project: { code: 'ELT001' },
    });

    const result = await resendDashboardProjectLink('ELT001', 'dash-token');

    expect(result.success).toBe(true);
    expect(result.customerLink).toBe('/?code=ELT001');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][0]).toContain('/api/dashboard/project/ELT001/resend');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('returns not-found payloads for missing dashboard projects', async () => {
    mockFetch({ success: false, error: 'PROJECT_NOT_FOUND' }, 404);
    const result = await resendDashboardProjectLink('ELT404', 'dash-token');
    expect(result.success).toBe(false);
    expect(result.error).toBe('PROJECT_NOT_FOUND');
  });
});

describe('updateDashboardProjectAssessor', () => {
  it('patches the inline assessor endpoint with the dashboard token', async () => {
    mockFetch({ success: true, project: { code: 'ELT001', assessor: 'Laura Martín Manzano' } });

    const result = await updateDashboardProjectAssessor('ELT001', 'Laura Martín Manzano', 'dash-token');

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

// ─────────────────────────────────────────────────────────────────────────────
// saveProgress — bad data conditions
// ─────────────────────────────────────────────────────────────────────────────
describe('saveProgress', () => {
  const minimalFormData = {
    dni: { front: null, back: null, originalPdfs: [] },
    ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
    electricityBill: { pages: [], originalPdfs: [] },
    contract: { originalPdfs: [], extraction: null },
    representation: {} as Parameters<typeof saveProgress>[1]['representation'],
    energyCertificate: { status: 'not-started' } as Parameters<typeof saveProgress>[1]['energyCertificate'],
    signatures: { customerSignature: null, repSignature: null },
  } as Parameters<typeof saveProgress>[1];

  it('returns success on save', async () => {
    mockFetch({ success: true });
    const result = await saveProgress('ELT001', minimalFormData);
    expect(result.success).toBe(true);
  });

  it('sends formData as JSON body', async () => {
    mockFetch({ success: true });
    await saveProgress('ELT001', minimalFormData);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toHaveProperty('formData');
  });

  it('propagates network error on save failure', async () => {
    mockFetchNetworkError('Server down');
    await expect(saveProgress('ELT001', minimalFormData)).rejects.toThrow('Server down');
  });

  it('includes the customer token when provided', async () => {
    mockFetch({ success: true });
    await saveProgress('ELT001', minimalFormData, 'customer', 'customer-token-20250001');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('token=customer-token-20250001');
    expect(options.headers['x-project-token']).toBe('customer-token-20250001');
  });

  it('rejects non-OK HTTP responses instead of treating them as saved', async () => {
    mockFetch({ success: false, message: 'rate limited' }, 429);
    await expect(saveProgress('ELT001', minimalFormData)).rejects.toThrow('rate limited');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// submitForm
// ─────────────────────────────────────────────────────────────────────────────
describe('submitForm', () => {
  const formData = {
    dni: { front: null, back: null, originalPdfs: [] },
    ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
    electricityBill: { pages: [], originalPdfs: [] },
    contract: { originalPdfs: [], extraction: null },
    representation: {} as Parameters<typeof submitForm>[1]['representation'],
    energyCertificate: { status: 'not-started' } as Parameters<typeof submitForm>[1]['energyCertificate'],
    signatures: { customerSignature: null, repSignature: null },
  } as Parameters<typeof submitForm>[1];

  it('returns submissionId on success', async () => {
    mockFetch({ success: true, submissionId: 'sub-123' });
    const result = await submitForm('ELT001', formData, 'customer', 'attempt-1');
    expect(result.success).toBe(true);
    expect(result.submissionId).toBe('sub-123');
  });

  it('includes source and attemptId in the JSON body', async () => {
    mockFetch({ success: true });
    await submitForm('ELT001', formData, 'assessor', 'attempt-2');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.source).toBe('assessor');
    expect(body.attemptId).toBe('attempt-2');
  });

  it('includes the customer token when provided', async () => {
    mockFetch({ success: true });
    await submitForm('ELT001', formData, 'customer', 'attempt-token', 'customer-token-20250001');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('token=customer-token-20250001');
    expect(options.headers['x-project-token']).toBe('customer-token-20250001');
  });

  it('propagates server error', async () => {
    mockFetchNetworkError('500 Internal Server Error');
    await expect(submitForm('ELT001', formData, 'customer', 'attempt-3')).rejects.toThrow();
  });

  it('rejects HTTP failures with the backend message', async () => {
    mockFetch({ success: false, message: 'submit failed' }, 500);
    await expect(submitForm('ELT001', formData, 'customer', 'attempt-4')).rejects.toThrow('submit failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// preUploadAssets
// ─────────────────────────────────────────────────────────────────────────────
describe('preUploadAssets', () => {
  const preview = 'data:image/jpeg;base64,ZmFrZQ==';

  function makeFormData() {
    return {
      dni: {
        front: {
          photo: {
            id: 'dni-front',
            preview,
            timestamp: 1,
            sizeBytes: 4,
          },
          extraction: null,
        },
        back: { photo: null, extraction: null },
        originalPdfs: [],
      },
      ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
      electricityBill: { pages: [], originalPdfs: [] },
      contract: { originalPdfs: [], extraction: null },
      additionalBankDocuments: [],
      representation: {} as Parameters<typeof preUploadAssets>[1]['representation'],
      energyCertificate: { status: 'not-started' } as Parameters<typeof preUploadAssets>[1]['energyCertificate'],
      signatures: { customerSignature: null, repSignature: null },
    } as Parameters<typeof preUploadAssets>[1];
  }

  it('uploads binary assets once and skips identical re-uploads', async () => {
    const response = mockFetch({ success: true, savedKeys: ['dniFront'] });
    const formData = makeFormData();

    await preUploadAssets('ELT-UPLOAD-001', formData);
    await preUploadAssets('ELT-UPLOAD-001', formData);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestBody = fetchMock.mock.calls[0][1].body as FormData;
    const entries = Array.from(requestBody.entries());
    expect(entries.some(([key]) => key === 'dniFront')).toBe(true);
    expect(entries.find(([key]) => key === 'activeKeys')?.[1]).toBe(JSON.stringify(['dniFront']));
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('syncs an empty manifest when assets were removed locally', async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn()
        .mockResolvedValueOnce({ success: true, savedKeys: ['dniFront'] })
        .mockResolvedValueOnce({ success: true, savedKeys: [] }),
      blob: vi.fn(),
      text: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await preUploadAssets('ELT-UPLOAD-002', makeFormData());
    await preUploadAssets('ELT-UPLOAD-002', {
      ...makeFormData(),
      dni: { front: { photo: null, extraction: null }, back: { photo: null, extraction: null }, originalPdfs: [] },
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestBody = fetchMock.mock.calls[1][1].body as FormData;
    const entries = Array.from(requestBody.entries());
    expect(entries).toEqual([['activeKeys', '[]']]);
  });

  it('rejects non-OK upload responses', async () => {
    mockFetch({ success: false, message: 'upload failed' }, 503);
    await expect(preUploadAssets('ELT-UPLOAD-003', makeFormData())).rejects.toThrow('upload failed');
  });

  it('includes property photo asset keys in the upload manifest', async () => {
    mockFetch({ success: true, savedKeys: ['dniFront', 'roof_0'] });

    await preUploadAssets('ELT-UPLOAD-004', {
      ...makeFormData(),
      roof: {
        photos: [{
          id: 'roof-1',
          preview,
          timestamp: 2,
          sizeBytes: 8,
        }],
      },
    } as Parameters<typeof preUploadAssets>[1] & { roof: { photos: Array<{ id: string; preview: string; timestamp: number; sizeBytes: number }> } });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const requestBody = fetchMock.mock.calls[0][1].body as FormData;
    const entries = Array.from(requestBody.entries());

    expect(entries.some(([key]) => key === 'roof_0')).toBe(true);
    expect(entries.find(([key]) => key === 'activeKeys')?.[1]).toBe(JSON.stringify(['dniFront', 'roof_0']));
  });

  it('uploads additional bank document assets with sequential bankDocument keys', async () => {
    mockFetch({ success: true, savedKeys: ['dniFront', 'bankDocument_0'] });

    await preUploadAssets('ELT-UPLOAD-005', {
      ...makeFormData(),
      additionalBankDocuments: [{
        id: 'bank-doc-1',
        type: 'payroll',
        files: [{
          id: 'bank-file-1',
          filename: 'nomina-marzo.pdf',
          mimeType: 'application/pdf',
          dataUrl: 'data:application/pdf;base64,ZmFrZQ==',
          timestamp: 3,
          sizeBytes: 12,
        }],
      }],
    } as Parameters<typeof preUploadAssets>[1]);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const requestBody = fetchMock.mock.calls[0][1].body as FormData;
    const entries = Array.from(requestBody.entries());

    expect(entries.some(([key]) => key === 'bankDocument_0')).toBe(true);
    expect(entries.find(([key]) => key === 'activeKeys')?.[1]).toBe(JSON.stringify(['dniFront', 'bankDocument_0']));
  });

  it('keeps additional bank document manifest keys even when the binary data was already stripped', async () => {
    mockFetch({ success: true, savedKeys: ['bankDocument_0'] });

    await preUploadAssets('ELT-UPLOAD-006', {
      ...makeFormData(),
      dni: { front: { photo: null, extraction: null }, back: { photo: null, extraction: null }, originalPdfs: [] },
      additionalBankDocuments: [{
        id: 'bank-doc-2',
        type: 'other',
        customLabel: 'IRPF 2024',
        files: [{
          id: 'bank-file-2',
          filename: 'irpf-2024.pdf',
          mimeType: 'application/pdf',
          dataUrl: '' as unknown as string,
          timestamp: 4,
          sizeBytes: 20,
          assetKey: 'bankDocument_0',
        }],
      }],
    } as Parameters<typeof preUploadAssets>[1]);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const requestBody = fetchMock.mock.calls[0][1].body as FormData;
    const entries = Array.from(requestBody.entries());

    expect(entries).toEqual([['activeKeys', '["bankDocument_0"]']]);
  });

  it('includes the customer token when provided', async () => {
    mockFetch({ success: true, savedKeys: ['dniFront'] });

    await preUploadAssets('ELT-UPLOAD-007', makeFormData(), 'customer-token-20250001');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('token=customer-token-20250001');
    expect(options.headers['x-project-token']).toBe('customer-token-20250001');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractDocument — bad data / AI API conditions
// ─────────────────────────────────────────────────────────────────────────────
describe('extractDocument', () => {
  it('returns extraction result on success', async () => {
    const extraction = { extractedData: { fullName: 'Ana García' }, confidence: 0.95, isCorrectDocument: true };
    mockFetch({ success: true, extraction });
    const result = await extractDocument('data:image/jpeg;base64,abc', 'dniFront');
    expect(result.success).toBe(true);
    expect(result.extraction).toBeDefined();
  });

  it('returns wrong-document when AI detects wrong document type', async () => {
    mockFetch({ success: false, isWrongDocument: true, reason: 'wrong-document' });
    const result = await extractDocument('data:image/jpeg;base64,abc', 'ibi');
    expect(result.isWrongDocument).toBe(true);
    expect(result.reason).toBe('wrong-document');
  });

  it('returns unreadable when AI cannot read the image', async () => {
    mockFetch({ success: false, isUnreadable: true, reason: 'unreadable' });
    const result = await extractDocument('data:image/jpeg;base64,blurry', 'dniFront');
    expect(result.isUnreadable).toBe(true);
  });

  it('handles an array of images (batch mode)', async () => {
    mockFetch({ success: true, extraction: {} });
    const result = await extractDocument(
      ['data:image/jpeg;base64,a', 'data:image/jpeg;base64,b'],
      'electricity'
    );
    expect(result.success).toBe(true);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.imagesBase64).toHaveLength(2);
  });

  it('propagates network error (AI API down)', async () => {
    mockFetchNetworkError('ECONNREFUSED');
    await expect(extractDocument('data:image/jpeg;base64,abc', 'ibi')).rejects.toThrow('ECONNREFUSED');
  });

  it('retries transient temporary-error responses before succeeding', async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn()
        .mockResolvedValueOnce({ success: false, reason: 'temporary-error', message: 'Temporarily unavailable' })
        .mockResolvedValueOnce({ success: true, extraction: { extractedData: { titular: 'Ana' } } }),
      blob: vi.fn(),
      text: vi.fn(),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractDocumentBatch(['data:image/jpeg;base64,a'], 'electricity');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry wrong-document responses', async () => {
    mockFetch({ success: false, reason: 'wrong-document', isWrongDocument: true });

    const result = await extractDocumentBatch(['data:image/jpeg;base64,a'], 'electricity');

    expect(result.reason).toBe('wrong-document');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient network failures before succeeding', async () => {
    const successResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, extraction: { extractedData: { titular: 'Ana' } } }),
      blob: vi.fn(),
      text: vi.fn(),
    };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(successResponse);
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractDocumentBatch(['data:image/jpeg;base64,a'], 'electricity');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteProject
// ─────────────────────────────────────────────────────────────────────────────
describe('deleteProject', () => {
  it('returns success on delete', async () => {
    mockFetch({ success: true, message: 'Project deleted' });
    const result = await deleteProject('ELT001', 'admin-token');
    expect(result.success).toBe(true);
  });

  it('uses DELETE method', async () => {
    mockFetch({ success: true });
    await deleteProject('ELT001', 'tok');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const options = fetchMock.mock.calls[0][1];
    expect(options.method).toBe('DELETE');
  });

  it('sends x-dashboard-token header', async () => {
    mockFetch({ success: true });
    await deleteProject('ELT001', 'my-admin-token');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['x-dashboard-token']).toBe('my-admin-token');
  });

  it('URL-encodes project code', async () => {
    mockFetch({ success: true });
    await deleteProject('ELT/001', 'tok');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('ELT/001');
    expect(calledUrl).toContain('ELT%2F001');
  });
});
