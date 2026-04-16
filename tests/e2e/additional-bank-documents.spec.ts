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

test('customer additional documents upload stays visible, skips AI extraction, and survives reload', async ({ page, request }) => {
  const projectCode = await createPublicProject(request);
  let extractCalls = 0;

  await page.route('**/api/extract', async (route) => {
    extractCalls += 1;
    await route.continue();
  });
  await page.route('**/api/extract-batch', async (route) => {
    extractCalls += 1;
    await route.continue();
  });

  await page.goto(`/?code=${projectCode}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('property-docs-continue-btn')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('additional-bank-documents-card')).toBeVisible();
  await expect(page.getByText('Documento adicional')).toBeVisible();

  await page.getByTestId('additional-bank-documents-input').setInputFiles({
    name: 'extra.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
  });

  await expect(page.getByText('extra.pdf')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('property-docs-continue-btn')).toBeEnabled();

  await expect.poll(async () => {
    const response = await request.get(`${API_BASE}/api/project/${projectCode}`, { timeout: 15000 });
    const body = await response.json();
    return body.project?.formData?.additionalBankDocuments?.length ?? 0;
  }, { timeout: 15000 }).toBe(1);

  expect(extractCalls).toBe(0);
});
