import { expect, test, type APIRequestContext } from '@playwright/test';
import { APPROVED_ASSESSOR } from './helpers/projectAccess';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

function uniquePhone() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  return `+346${suffix}`;
}

async function createPublicProject(request: APIRequestContext) {
  const response = await request.post(`${API_BASE}/api/project/create`, {
    data: {
      phone: uniquePhone(),
      assessor: APPROVED_ASSESSOR,
      assessorId: APPROVED_ASSESSOR,
    },
    timeout: 15000,
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  return body.project.code as string;
}

test('customer property-docs flow no longer shows the additional-document upload box', async ({ page, request }) => {
  const projectCode = await createPublicProject(request);

  await page.goto(`/?code=${projectCode}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('property-docs-continue-btn')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('h1').first()).toContainText('Documentos');
  await expect(page.getByTestId('additional-bank-documents-card')).toHaveCount(0);
  await expect(page.getByText('Documento adicional')).toHaveCount(0);
});
