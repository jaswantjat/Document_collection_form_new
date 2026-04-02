import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';
const VALID_CODE = 'ELT20250001';
const VALID_TOKEN = 'b43df737-e202-40d8-ba45-277dceb9d323';
const BAD_TOKEN = 'invalid-token-0000';

test.describe('API Coverage', () => {
  test('API-01: POST /api/project/:code/save with valid payload returns 200', async ({ request }) => {
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/save`, {
      headers: { 'x-project-token': VALID_TOKEN, 'Content-Type': 'application/json' },
      data: { formData: {} },
      timeout: 15000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    console.log('[API-01] Response:', JSON.stringify(body).slice(0, 120));
    expect(body.success).toBe(true);
    console.log('[API-01] PASS — save with valid token returns 200');
  });

  test('API-02: POST /api/project/:code/save with invalid token returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/save`, {
      headers: { 'x-project-token': BAD_TOKEN, 'Content-Type': 'application/json' },
      data: { formData: {} },
      timeout: 15000,
    });
    console.log('[API-02] Status:', res.status());
    expect([401, 403]).toContain(res.status());
    console.log('[API-02] PASS — save with wrong token returns 401/403');
  });

  test('API-03: GET /api/project/:code/download-zip returns a ZIP file', async ({ request }) => {
    const loginRes = await request.post(`${BASE}/api/dashboard/login`, {
      data: { password: 'eltex2025' },
      timeout: 10000,
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    const dashToken = loginBody.token;
    expect(dashToken).toBeTruthy();
    console.log('[API-03] Dashboard login OK, token:', dashToken?.slice(0, 8) + '...');

    const res = await request.get(`${BASE}/api/project/${VALID_CODE}/download-zip`, {
      headers: { 'x-dashboard-token': dashToken },
      timeout: 30000,
    });
    console.log('[API-03] Status:', res.status());
    expect(res.status()).toBe(200);
    const contentType = res.headers()['content-type'] || '';
    console.log('[API-03] Content-Type:', contentType);
    expect(contentType).toMatch(/zip|octet-stream/);
    const body = await res.body();
    expect(body.length).toBeGreaterThanOrEqual(22);
    console.log('[API-03] PASS — download-zip returns ZIP of', body.length, 'bytes (22 = valid empty ZIP)');
  });
});
