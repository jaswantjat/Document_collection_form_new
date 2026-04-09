import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const VALID_CODE = 'ELT20250001';

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
}

async function loginDashboard(request: any) {
  const loginRes = await request.post(`${BASE}/api/dashboard/login`, {
    data: { password: 'eltex2025' },
    timeout: 10000,
  });
  expect(loginRes.status()).toBe(200);
  const loginBody = await loginRes.json();
  expect(loginBody.token).toBeTruthy();
  return loginBody.token as string;
}

test.describe('API Coverage', () => {
  test('API-01: POST /api/project/:code/save succeeds without customer token headers', async ({ request }) => {
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/save`, {
      headers: { 'Content-Type': 'application/json' },
      data: { formData: {} },
      timeout: 15000,
    });
    expect(res.status()).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test('API-02: POST /api/project/:code/save returns 404 for an unknown project code', async ({ request }) => {
    const res = await request.post(`${BASE}/api/project/ELT99999999/save`, {
      headers: { 'Content-Type': 'application/json' },
      data: { formData: {} },
      timeout: 15000,
    });
    expect(res.status()).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'PROJECT_NOT_FOUND' });
  });

  test('API-03: GET /api/project/:code/download-zip returns a ZIP file after dashboard login', async ({ request }) => {
    const dashToken = await loginDashboard(request);

    const res = await request.get(`${BASE}/api/project/${VALID_CODE}/download-zip`, {
      headers: { 'x-dashboard-token': dashToken },
      timeout: 30000,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] || '').toMatch(/zip|octet-stream/);
    expect((await res.body()).length).toBeGreaterThanOrEqual(22);
  });

  test('API-04: upload-assets prunes stale asset keys when the active manifest shrinks', async ({ request }) => {
    const createRes = await request.post(`${BASE}/api/project/create`, {
      data: {
        phone: uniquePhone(),
        assessor: 'QA Bot',
        assessorId: 'QA-BOT',
      },
      timeout: 15000,
    });
    expect(createRes.status()).toBe(200);
    const createBody = await createRes.json();
    const code = createBody.project.code as string;
    expect(code).toBeTruthy();

    const firstUpload = await request.post(`${BASE}/api/project/${code}/upload-assets`, {
      multipart: {
        activeKeys: JSON.stringify(['dniFront']),
        dniFront: {
          name: 'dni-front.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('fake-image'),
        },
      },
      timeout: 15000,
    });
    expect(firstUpload.status()).toBe(200);

    const firstProject = await request.get(`${BASE}/api/project/${code}`, { timeout: 15000 });
    const firstBody = await firstProject.json();
    expect(firstBody.project.assetFiles.dniFront).toContain(`/uploads/assets/${code}/dniFront`);

    const secondUpload = await request.post(`${BASE}/api/project/${code}/upload-assets`, {
      multipart: {
        activeKeys: JSON.stringify([]),
      },
      timeout: 15000,
    });
    expect(secondUpload.status()).toBe(200);

    const secondProject = await request.get(`${BASE}/api/project/${code}`, { timeout: 15000 });
    const secondBody = await secondProject.json();
    expect(secondBody.project.assetFiles.dniFront).toBeUndefined();
  });

  test('API-05: reset endpoints recreate missing seeded follow-up fixtures', async ({ request }) => {
    const dashToken = await loginDashboard(request);

    for (const code of ['ELT20250004', 'ELT20250005']) {
      await request.delete(`${BASE}/api/dashboard/project/${code}`, {
        headers: { 'x-dashboard-token': dashToken },
        timeout: 15000,
      });
    }

    const resetRes = await request.post(`${BASE}/api/test/restore-base-flow/ELT20250005`, {
      timeout: 15000,
    });
    expect(resetRes.status()).toBe(200);

    const projectRes = await request.get(`${BASE}/api/project/ELT20250005`, {
      timeout: 15000,
    });
    expect(projectRes.status()).toBe(200);
    const projectBody = await projectRes.json();
    expect(projectBody.project.code).toBe('ELT20250005');
  });

  test('API-06: submit is idempotent when the first response times out client-side', async ({ request }) => {
    await request.post(`${BASE}/api/test/restore-base-flow/ELT20250005`, { timeout: 15000 });

    const beforeRes = await request.get(`${BASE}/api/project/ELT20250005`, { timeout: 15000 });
    const beforeBody = await beforeRes.json();
    const beforeSubmissionCount = beforeBody.project.submissionCount as number;
    const formData = beforeBody.project.formData;
    const attemptId = `attempt-${Date.now()}`;

    await expect(request.post(`${BASE}/api/project/ELT20250005/submit`, {
      headers: { 'x-test-submit-delay-ms': '250' },
      data: { formData, source: 'customer', attemptId },
      timeout: 50,
    })).rejects.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 350));

    const retryRes = await request.post(`${BASE}/api/project/ELT20250005/submit`, {
      data: { formData, source: 'customer', attemptId },
      timeout: 15000,
    });
    expect(retryRes.status()).toBe(200);
    const retryBody = await retryRes.json();
    expect(retryBody.success).toBe(true);
    expect(retryBody.submissionId).toBeTruthy();

    const afterRes = await request.get(`${BASE}/api/project/ELT20250005`, { timeout: 15000 });
    const afterBody = await afterRes.json();
    expect(afterBody.project.submissionCount).toBe(beforeSubmissionCount + 1);
  });
});
