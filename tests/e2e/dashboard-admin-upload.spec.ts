import { expect, test } from '@playwright/test';
import path from 'node:path';
import { APPROVED_ASSESSOR } from './helpers/projectAccess';
import { bindPageToE2EBackend } from './helpers/pageBackendProxy';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const ADMIN_UPLOAD_FILE = path.resolve(process.cwd(), 'app/public/eltex-logo.png');
const transientProjectCodes = new Set<string>();

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
}

function trackTransientProjectCode(code: string) {
  transientProjectCodes.add(code);
  return code;
}

async function loginDashboard(request: any) {
  const loginRes = await request.post(`${API_BASE}/api/dashboard/login`, {
    data: { password: 'eltex2025' },
    timeout: 20000,
  });
  expect(loginRes.status()).toBe(200);
  const loginBody = await loginRes.json();
  return loginBody.token as string;
}

async function createDashboardProject(request: any) {
  const dashboardToken = await loginDashboard(request);
  const createRes = await request.post(`${API_BASE}/api/dashboard/project`, {
    data: {
      phone: uniquePhone(),
      assessor: APPROVED_ASSESSOR,
      email: `qa-dashboard-upload+${Date.now()}@example.com`,
    },
    headers: {
      'Content-Type': 'application/json',
      'x-dashboard-token': dashboardToken,
    },
    timeout: 30000,
  });
  expect(createRes.status()).toBe(200);
  const createBody = await createRes.json();
  return trackTransientProjectCode(createBody.project.code as string);
}

async function deleteProjectAsAdmin(request: any, code: string, dashboardToken?: string) {
  const token = dashboardToken ?? await loginDashboard(request);
  const response = await request.delete(`${API_BASE}/api/dashboard/project/${code}`, {
    headers: { 'x-dashboard-token': token },
    timeout: 30000,
    failOnStatusCode: false,
  });
  expect([200, 404]).toContain(response.status());
}

async function openDashboard(page: any, token: string) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.evaluate((dashboardToken: string) => {
    sessionStorage.setItem('dashboard_token', dashboardToken);
  }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...')).toBeVisible({ timeout: 15000 });
}

async function openProjectDetail(page: any, projectText: string) {
  const row = page.locator('tbody tr').filter({ hasText: projectText }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByTestId('ver-expediente-btn').click();
  await expect(page.getByTestId('project-detail-modal')).toBeVisible({ timeout: 30000 });
  return row;
}

async function expectDetailUploadTargets(page: any) {
  const modal = page.getByTestId('project-detail-modal');
  await expect(modal.getByTestId('detail-upload-workspace')).toBeVisible();
  for (const key of ['dni-front', 'dni-back', 'ibi', 'electricity-bill', 'additional-bank-document']) {
    await expect(modal.getByTestId(`detail-upload-zone-${key}`)).toBeVisible();
  }
}

async function dropFileOnUploadZone(
  page: any,
  zoneTestId: string,
  file: { name: string; mimeType: string; buffer: Buffer }
) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, mimeType, bytes }: { name: string; mimeType: string; bytes: number[] }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }));
      return transfer;
    },
    {
      name: file.name,
      mimeType: file.mimeType,
      bytes: [...file.buffer],
    }
  );
  const zone = page.getByTestId(zoneTestId);
  await zone.dispatchEvent('dragover', { dataTransfer });
  await zone.dispatchEvent('drop', { dataTransfer });
}

test.describe('Dashboard admin upload', () => {
  test.describe.configure({ timeout: 90000 });

  test.beforeEach(async ({ page }) => {
    await bindPageToE2EBackend(page);
  });

  test.afterEach(async ({ request }) => {
    const codes = [...transientProjectCodes];
    transientProjectCodes.clear();
    if (codes.length === 0) return;

    const token = await loginDashboard(request);
    await Promise.all(codes.map((code) => deleteProjectAsAdmin(request, code, token)));
  });

  test('saves additional documents without triggering AI extraction and surfaces them in the status column', async ({ page, request }) => {
    const code = await createDashboardProject(request);
    const token = await loginDashboard(request);
    let extractCalls = 0;

    await page.route('**/api/extract', async (route) => {
      extractCalls += 1;
      await route.continue();
    });
    await page.route('**/api/extract-batch', async (route) => {
      extractCalls += 1;
      await route.continue();
    });

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    const row = page.locator('tbody tr').filter({ hasText: code }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).not.toContainText('Documento adicional');
    await openProjectDetail(page, code);
    await expectDetailUploadTargets(page);

    const modal = page.getByTestId('project-detail-modal');
    const uploadZone = modal.getByTestId('detail-upload-zone-additional-bank-document');
    await dropFileOnUploadZone(page, 'detail-upload-zone-additional-bank-document', {
      name: 'irpf-2024.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
    });

    await expect(uploadZone.getByText('Documento adicional guardado correctamente.')).toBeVisible({ timeout: 30000 });
    await expect(modal.getByTitle('Descargar Documento adicional')).toBeVisible();
    await page.getByTestId('project-detail-modal').click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('project-detail-modal')).toBeHidden({ timeout: 15000 });

    await expect(row).toContainText('Documento adicional', { timeout: 30000 });
    await expect(row).toContainText('1 archivo', { timeout: 30000 });
    expect(extractCalls).toBe(0);

    await row.getByTestId('ver-expediente-btn').click();
    await expect(page.getByTestId('project-detail-modal')).toBeVisible();
    const bankDocDownload = page.waitForEvent('download');
    await page.getByTestId('project-detail-modal').getByTitle('Descargar Documento adicional').click();
    expect((await bankDocDownload).suggestedFilename()).toBe(`${code}_documento_adicional.pdf`);
  });

  test('refreshes the dashboard and makes the new DNI document downloadable', async ({ page, request }) => {
    const code = await createDashboardProject(request);
    const token = await loginDashboard(request);

    await page.route('**/api/extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          extraction: {
            extractedData: {
              fullName: 'Admin Upload Test',
              dniNumber: '12345678A',
            },
            confidence: 1,
            isCorrectDocument: true,
            documentTypeDetected: 'dni',
            identityDocumentKind: 'dni-card',
            needsManualReview: false,
          },
        }),
      });
    });

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await openProjectDetail(page, code);
    await expectDetailUploadTargets(page);

    const uploadZone = page.getByTestId('detail-upload-zone-dni-front');
    await page.getByTestId('detail-upload-input-dni-front').setInputFiles(ADMIN_UPLOAD_FILE);
    await expect(uploadZone.getByText('Documento guardado correctamente.')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('project-detail-modal').getByTitle('Descargar DNI frontal').first()).toBeVisible();
  });
});
