import { expect, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const DASHBOARD_PASSWORD = process.env.E2E_DASHBOARD_PASSWORD ?? 'eltex2025';

export const APPROVED_ASSESSOR = 'Sergi Guillen Cavero';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|EPIPE|socket hang up|Timeout .* exceeded/i.test(message);
}

export async function loginDashboard(request: APIRequestContext): Promise<string> {
  let response: Awaited<ReturnType<APIRequestContext['post']>> | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await request.post(`${API_BASE}/api/dashboard/login`, {
        data: { password: DASHBOARD_PASSWORD },
        timeout: 30000,
      });
      break;
    } catch (error) {
      if (!isTransientRequestError(error) || attempt === 2) throw error;
      await delay(250);
    }
  }

  expect(response).toBeTruthy();
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
  let response: Awaited<ReturnType<APIRequestContext['get']>> | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await request.get(`${API_BASE}/api/dashboard/project/${projectCode}`, {
        headers: { 'x-dashboard-token': dashboardToken },
        timeout: 15000,
      });
      break;
    } catch (error) {
      if (!isTransientRequestError(error) || attempt === 2) throw error;
      await delay(250);
    }
  }

  expect(response).toBeTruthy();
  expect(response.status()).toBe(200);

  const body = await response.json();
  const accessToken = body.project?.accessToken as string | undefined;
  expect(accessToken).toBeTruthy();

  return {
    dashboardToken,
    accessToken: accessToken as string,
    customerUrl: `/?code=${projectCode}`,
    assessorUrl: `/?code=${projectCode}&source=assessor`,
  };
}
