import { expect, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const DASHBOARD_PASSWORD = process.env.E2E_DASHBOARD_PASSWORD ?? 'eltex2025';

export const APPROVED_ASSESSOR = 'Sergi Guillen Cavero';

export async function loginDashboard(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API_BASE}/api/dashboard/login`, {
    data: { password: DASHBOARD_PASSWORD },
    timeout: 10000,
  });
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.token).toBeTruthy();
  return body.token as string;
}

export async function getProjectAccess(
  request: APIRequestContext,
  projectCode: string,
): Promise<{
  dashboardToken: string;
  accessToken: string;
  customerUrl: string;
  assessorUrl: string;
}> {
  const dashboardToken = await loginDashboard(request);
  const response = await request.get(`${API_BASE}/api/dashboard/project/${projectCode}`, {
    headers: { 'x-dashboard-token': dashboardToken },
    timeout: 15000,
  });
  expect(response.status()).toBe(200);

  const body = await response.json();
  const accessToken = body.project?.accessToken as string | undefined;
  expect(accessToken).toBeTruthy();

  return {
    dashboardToken,
    accessToken: accessToken as string,
    customerUrl: `/?code=${projectCode}&token=${encodeURIComponent(accessToken as string)}`,
    assessorUrl: `/?code=${projectCode}&token=${encodeURIComponent(accessToken as string)}&source=assessor`,
  };
}
