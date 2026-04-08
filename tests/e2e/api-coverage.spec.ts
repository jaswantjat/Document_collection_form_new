import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const VALID_CODE = 'ELT20250001';

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
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
    const loginRes = await request.post(`${BASE}/api/dashboard/login`, {
      data: { password: 'eltex2025' },
      timeout: 10000,
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    const dashToken = loginBody.token;
    expect(dashToken).toBeTruthy();

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
});
