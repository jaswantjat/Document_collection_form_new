import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

async function loginDashboard(request: any) {
  const loginRes = await request.post(`${API_BASE}/api/dashboard/login`, {
    data: { password: 'eltex2025' },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginBody = await loginRes.json();
  return loginBody.token as string;
}

async function getProjectAccessToken(request: any, code: string) {
  const dashToken = await loginDashboard(request);
  const projectRes = await request.get(`${API_BASE}/api/dashboard/project/${code}`, {
    headers: { 'x-dashboard-token': dashToken },
  });
  expect(projectRes.ok()).toBeTruthy();
  const projectBody = await projectRes.json();
  return {
    dashboardToken: dashToken,
    accessToken: projectBody.project.accessToken as string,
  };
}

test.describe('Bug Regressions', () => {
  test('REG-01: international phone format (+44, +33, +1) accepted by backend normalizePhone', async ({ request }) => {
    const phones = ['+447700900000', '+33612345678', '+12025550123'];

    for (const phone of phones) {
      const res = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent(phone)}`);
      expect([200, 404]).toContain(res.status());
    }
  });

  test('REG-02: wrong customer token is rejected', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/project/ELT20250001?token=wrong-token`);
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'INVALID_TOKEN' });
  });

  test('REG-03: code-only customer links fail after cutover', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/project/ELT20250001`);
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'UNAUTHORIZED' });
  });

  test('REG-04: rotating the customer link invalidates the old token immediately', async ({ request }) => {
    const { dashboardToken, accessToken: oldToken } = await getProjectAccessToken(request, 'ELT20250001');

    const rotateRes = await request.post(`${API_BASE}/api/dashboard/project/ELT20250001/secure-link`, {
      headers: { 'x-dashboard-token': dashboardToken },
    });
    expect(rotateRes.status()).toBe(200);
    const rotateBody = await rotateRes.json();
    const newToken = rotateBody.project.accessToken as string;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
    expect(rotateBody.customerUrl).toContain(`token=${newToken}`);

    const oldRes = await request.get(`${API_BASE}/api/project/ELT20250001?token=${encodeURIComponent(oldToken)}`);
    expect(oldRes.status()).toBe(401);
    await expect(oldRes.json()).resolves.toMatchObject({ success: false, error: 'INVALID_TOKEN' });

    const newRes = await request.get(`${API_BASE}/api/project/ELT20250001?token=${encodeURIComponent(newToken)}`);
    expect(newRes.status()).toBe(200);
    await expect(newRes.json()).resolves.toMatchObject({ success: true, project: { code: 'ELT20250001' } });
  });
});
