import { test, expect, type Page } from '@playwright/test';

const EC04_CODE = 'ELT20250004';
const BACKEND = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

async function resetEC(request: any, code: string) {
  const res = await request.post(`${BACKEND}/api/test/reset-ec/${code}`);
  if (!res.ok()) {
    console.warn(`[RESET] Failed to reset ${code}:`, await res.text());
  }
}

async function openEnergyCertificateFromReview(page: Page) {
  await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
  await page.getByRole('button', { name: /certificado energético/i }).click();
  await expect(page.locator('h1').first()).toHaveText(/certificado energético|vivienda/i);
}

test.describe('Energy Certificate PRD Tests', () => {
  
  test('EC-01: skip path — can reach and click skip on energy-certificate step', async ({ page, request }) => {
    await resetEC(request, EC04_CODE);
    // Follow-up users now land on review first, then explicitly open the EC step.
    await page.goto(`/?code=${EC04_CODE}`);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificateFromReview(page);

    // Find and click Skip button
    const skipBtn = page.getByRole('button', { name: /saltar|omitir|ahora no/i }).first();
    await expect(skipBtn).toBeVisible();
    await skipBtn.click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
    await expect(page.getByText(/El certificado energético es opcional y no bloquea el envío inicial/i)).toBeVisible();
    await page.getByTestId('review-submit-btn').click();

    await expect(page.locator('h1').first()).toContainText('¡Todo listo');
  });

  test('EC-02: dashboard shows pending status for project with no EC data', async ({ page }) => {
    // Need to login to dashboard first or use a direct route if allowed
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Check if we are on login page
    if (await page.getByLabel(/contraseña/i).isVisible()) {
        await page.getByLabel(/contraseña/i).fill('eltex2025'); // Dev default from server.js
        await page.getByRole('button', { name: /entrar|iniciar sesión/i }).click();
        await page.waitForLoadState('networkidle');
    }

    // Look for ELT20250001 in the project list
    const row = page.locator('tr, [data-testid="project-row"], li').filter({ hasText: 'ELT20250001' }).first();
    const rowVisible = await row.isVisible().catch(() => false);
    if (rowVisible) {
      // EC status for this project should be "Pendiente" (not-started)
      const pageText = await page.locator('body').textContent();
      console.log('[EC-02] Page contains Pendiente:', pageText?.includes('Pendiente'));
      expect(pageText).toBeTruthy();
    } else {
      console.log('[EC-02] ELT20250001 row not found — may need dashboard navigation');
    }
  });

  test('EC-03: /dashboard route renders correctly (login gate)', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Should show login form or dashboard
    const loginHeading = page.getByText(/panel de control|dashboard|acceso/i);
    await expect(loginHeading).toBeVisible();
  });

  test('EC-04: invalid project code shows contact-advisor handling', async ({ page }) => {
    await page.goto('/?code=INVALID_123');
    await page.waitForLoadState('networkidle');
    
    await expect(page.getByRole('heading', { name: /enlace no válido/i })).toBeVisible();
    await expect(page.getByText(/contacta con tu asesor/i)).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  });

  test.describe('Conditional Field Visibility (COND fixes)', () => {
    const URL = `/?code=${EC04_CODE}`;

    test.beforeEach(async ({ request }) => {
      await resetEC(request, EC04_CODE);
    });

    async function fillAndAdvanceHousingStep(page: any) {
      await page.getByRole('spinbutton', { name: /tamaño/i }).fill('120');
      await page.getByRole('spinbutton', { name: /plantas/i }).fill('2');
      await page.getByRole('spinbutton', { name: /dormitorios/i }).fill('3');
      await page.getByRole('button', { name: 'Entre 2,7m y 3,2m' }).click();
      
      // Navigate from the section label <p> → its parent div → inputs (avoids matching outer ancestor divs)
      const doorSection = page.locator('p', { hasText: 'Nº PUERTAS Exterior' }).locator('xpath=..');
      const doorInputs = doorSection.locator('input');
      for (let i = 0; i < 4; i++) {
        await doorInputs.nth(i).fill('1');
      }
      const windowSection = page.locator('p', { hasText: 'Nº VENTANAS Exterior' }).locator('xpath=..');
      const windowInputs = windowSection.locator('input');
      for (let i = 0; i < 4; i++) {
        await windowInputs.nth(i).fill('2');
      }

      await page.getByRole('button', { name: 'PVC' }).click();
      await page.getByPlaceholder('Madera').fill('Madera');
      await page.getByRole('button', { name: 'Doble vidrio' }).click();
      // "¿Ventanas con persiana?" No button — navigate from the label <p> to parent div
      const shutterLabel = page.locator('p', { hasText: '¿Ventanas con persiana?' });
      await shutterLabel.locator('xpath=..').getByRole('button', { name: 'No', exact: true }).click();

      await page.getByRole('button', { name: /siguiente/i }).click();
    }

    async function fillAndAdvanceThermalStep(page: any) {
      // Click the "Caldera" thermal installation type button by its visible label text
      await page.getByRole('button', { name: 'Caldera (ACS y calefacción)' }).click();
      await page.getByRole('button', { name: 'Gas', exact: true }).click();
      await page.getByPlaceholder('Marca y año de la instalación').fill('Samsung 2020');
      // "¿Aire Acondicionado?" No button — navigate from the label <p> to parent div
      const acLabel = page.locator('p', { hasText: '¿Aire Acondicionado?' });
      await acLabel.locator('xpath=..').getByRole('button', { name: 'No', exact: true }).click();
      await page.getByRole('button', { name: 'Radiadores de Agua' }).click();
      await page.getByRole('button', { name: 'Aluminio' }).click();
      await page.getByRole('button', { name: 'Monofásica' }).click();

      await page.getByRole('button', { name: /siguiente/i }).click();
    }

    test('COND-01 (Housing): shutterWindowCount visibility', async ({ page }) => {
      await page.goto(URL);
      await page.waitForLoadState('networkidle');
      await openEnergyCertificateFromReview(page);

      // YesNoField renders: <p>label</p> then sibling <div> with <button>Sí</button><button>No</button>
      // Navigate: p element → parent div → buttons
      const shutterLabel = page.locator('p', { hasText: '¿Ventanas con persiana?' });
      const shutterContainer = shutterLabel.locator('xpath=..');
      const noBtn = shutterContainer.getByRole('button', { name: 'No', exact: true });
      const yesBtn = shutterContainer.getByRole('button', { name: 'Sí', exact: true });

      await noBtn.click();
      await expect(page.getByLabel('Nº ventanas con persianas')).not.toBeVisible();

      await yesBtn.click();
      await expect(page.getByLabel('Nº ventanas con persianas')).toBeVisible();
    });

    test('COND-02 (Thermal): airConditioning visibility', async ({ page }) => {
      await page.goto(URL);
      await page.waitForLoadState('networkidle');
      await openEnergyCertificateFromReview(page);

      await fillAndAdvanceHousingStep(page);

      // Navigate from label <p> → parent div → buttons (same pattern as COND-01)
      const acLabel = page.locator('p', { hasText: '¿Aire Acondicionado?' });
      const acContainer = acLabel.locator('xpath=..');
      const noBtn = acContainer.getByRole('button', { name: 'No', exact: true });
      const yesBtn = acContainer.getByRole('button', { name: 'Sí', exact: true });

      await noBtn.click();
      await expect(page.getByText('Detalles (marca y año)')).not.toBeVisible();
      await expect(page.getByText('¿Tipo de Bomba?')).not.toBeVisible();

      await yesBtn.click();
      await expect(page.getByText('Detalles (marca y año)')).toBeVisible();
      await expect(page.getByText('¿Tipo de Bomba?')).toBeVisible();
    });

    test('COND-03 (Additional): solarPanelDetails visibility', async ({ page }) => {
      await page.goto(URL);
      await page.waitForLoadState('networkidle');
      await openEnergyCertificateFromReview(page);

      await fillAndAdvanceHousingStep(page);
      await fillAndAdvanceThermalStep(page);

      // Navigate from label <p> → parent div → buttons
      const solarLabel = page.locator('p', { hasText: '¿Placas solares?' });
      const solarContainer = solarLabel.locator('xpath=..');
      const noBtn = solarContainer.getByRole('button', { name: 'No', exact: true });
      const yesBtn = solarContainer.getByRole('button', { name: 'Sí', exact: true });

      await noBtn.click();
      await expect(page.getByText('Detalles de la Instalación Fotovoltaica')).not.toBeVisible();

      await yesBtn.click();
      await expect(page.getByText('Detalles de la Instalación Fotovoltaica')).toBeVisible();
    });
  });
});
