import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const APPROVED_ASSESSORS = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'app/src/shared/approvedAssessors.json'), 'utf8')
) as string[];

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `699 ${suffix.slice(0, 3)} ${suffix.slice(3, 6)}`;
}

function makePhoto(id: string) {
  return {
    id,
    preview: `data:image/jpeg;base64,${id}`,
    timestamp: Date.now(),
    sizeBytes: 128,
  };
}

async function createPublicProject(request: APIRequestContext) {
  const res = await request.post(`${API_BASE}/api/project/create`, {
    data: {
      phone: `+34${uniquePhone().replace(/\s+/g, '')}`,
      assessor: APPROVED_ASSESSORS[0],
      assessorId: APPROVED_ASSESSORS[0],
    },
    timeout: 15000,
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.project.code as string;
}

test.describe('Bug Regressions', () => {
  test('REG-01: bare home page stays on the public phone start flow', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('input[type="tel"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /continuar|buscar|seguir/i }).first()).toBeVisible();
  });

  test('REG-01b: public new-project flow shows the full approved assessor dropdown', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="tel"]').first().fill(uniquePhone());
    await page.getByRole('button', { name: /continuar|buscar|seguir/i }).first().click();
    await page.waitForLoadState('networkidle');

    const options = await page.getByTestId('phone-create-assessor-select').locator('option').allTextContents();
    expect(options).toEqual(['Selecciona un asesor', ...APPROVED_ASSESSORS]);
  });

  test('REG-02: stale or unknown codes recover to the public start flow instead of dead-ending', async ({ page }) => {
    await page.goto('/?code=UNKNOWN_TEST_CODE_12345');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('input[type="tel"]').first()).toBeVisible();
  });

  test('REG-03: /api/project/:code stays code-based even if a stray x-project-token header is present', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/project/ELT20250001`, {
      headers: { 'x-project-token': 'wrong-token' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.project?.code).toBe('ELT20250001');
  });

  test('REG-04: international phone format is accepted by the public lookup route', async ({ request }) => {
    const phones = ['+447700900000', '+33612345678', '+12025550123'];

    for (const phone of phones) {
      const res = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent(phone)}`, {
        failOnStatusCode: false,
      });
      expect([200, 404]).toContain(res.status());
      const body = await res.json();
      if (res.status() === 404) {
        expect(body.error).toBe('NOT_FOUND');
      }
    }
  });

  test('REG-05: province step requires an explicit person-or-company choice with clear copy', async ({ page, request }) => {
    const code = await createPublicProject(request);

    const saveRes = await request.post(`${API_BASE}/api/project/${code}/save`, {
      data: {
        source: 'customer',
        formData: {
          dni: {
            front: { photo: makePhoto('dni-front'), extraction: null },
            back: { photo: makePhoto('dni-back'), extraction: null },
          },
          ibi: {
            pages: [makePhoto('ibi-1')],
          },
          electricityBill: {
            pages: [{ photo: makePhoto('bill-1'), extraction: null }],
          },
          representation: {
            location: null,
            isCompany: false,
            holderTypeConfirmed: false,
            companyName: '',
            companyNIF: '',
            companyAddress: '',
            companyMunicipality: '',
            companyPostalCode: '',
            postalCode: '',
            ivaPropertyAddress: '',
            ivaCertificateSignature: null,
            representacioSignature: null,
            generalitatRole: 'titular',
            generalitatSignature: null,
            poderRepresentacioSignature: null,
            ivaCertificateEsSignature: null,
            renderedDocuments: {},
          },
        },
      },
      timeout: 15000,
    });
    expect(saveRes.status()).toBe(200);

    await page.goto(`/?code=${code}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText('Ubicación', { timeout: 20000 });

    await page.getByTestId('select-province-btn').click();
    await page.getByTestId('province-btn-cataluna').click();

    await expect(page.getByText('¿A nombre de quién está el contrato o la factura?')).toBeVisible();
    await expect(page.getByText('Elige una opción para que preparemos los documentos correctos.')).toBeVisible();
    await expect(page.getByTestId('province-continue-btn')).toBeDisabled();

    await page.getByTestId('holder-type-option-company').click();
    await expect(page.getByText('El contrato está a nombre de una sociedad o negocio y te pediremos sus datos fiscales.')).toBeVisible();
    await expect(page.getByText('Datos de la empresa')).toBeVisible();
    await expect(page.getByTestId('province-continue-btn')).toBeDisabled();

    await page.getByTestId('holder-type-option-individual').click();
    await expect(page.getByText('El contrato está a nombre de una persona, por ejemplo Juan Pérez.')).toBeVisible();
    await expect(page.getByText('Datos de la empresa')).toHaveCount(0);
    await expect(page.getByTestId('province-continue-btn')).toBeEnabled();
  });
});
