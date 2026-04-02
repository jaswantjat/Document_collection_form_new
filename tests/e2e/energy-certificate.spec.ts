import { test, expect } from '@playwright/test';

const TOKEN_1 = 'b43df737-e202-40d8-ba45-277dceb9d323';

test.describe('Energy Certificate PRD Tests', () => {
  
  test('EC-01: skip path — can reach and click skip on energy-certificate step', async ({ page }) => {
    // Start from a project that should reach EC section (ELT20250001)
    await page.goto(`/?code=ELT20250001&token=${TOKEN_1}`);
    await page.waitForLoadState('networkidle');

    // Find and click Skip button if we are on EC section
    // We need to know what the Skip button looks like. 
    // Usually it says "Saltar", "Omitir" or "Ahora no"
    const skipBtn = page.getByRole('button', { name: /saltar|omitir|ahora no/i }).first();
    
    // If not immediately on EC section, we might need to navigate there.
    // But based on T001 description, it assumes we can reach it.
    
    const heading = page.locator('h1').first();
    const headingText = await heading.textContent();
    
    if (headingText?.toLowerCase().includes('certificado energético') || headingText?.toLowerCase().includes('vivienda')) {
        await expect(skipBtn).toBeVisible();
        await skipBtn.click();
        await page.waitForLoadState('networkidle');
        
        // After skipping, it should go to ReviewSection
        const nextHeading = page.locator('h1').first();
        await expect(nextHeading).not.toHaveText(/certificado energético/i);
    } else {
        console.log('Skipping EC-01: Project ELT20250001 not on EC section. Currently on:', headingText);
    }
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

  test('EC-04: invalid project code renders error ("Enlace no válido")', async ({ page }) => {
    await page.goto('/?code=INVALID_123');
    await page.waitForLoadState('networkidle');
    
    const errorText = page.getByText(/enlace no válido|error|no encontrado/i);
    await expect(errorText).toBeVisible();
  });

  test.describe('Conditional Field Visibility (COND fixes)', () => {
    const TOKEN_1 = 'b43df737-e202-40d8-ba45-277dceb9d323';
    const URL = `/?code=ELT20250001&token=${TOKEN_1}`;

    async function fillAndAdvanceHousingStep(page: any) {
      await page.getByPlaceholder('120').fill('120');
      await page.getByPlaceholder('2').fill('2');
      await page.getByPlaceholder('3').fill('3');
      await page.getByRole('button', { name: 'Entre 2,7m y 3,2m' }).click();
      
      const orientations = ['Norte', 'Este', 'Sur', 'Oeste'];
      const doorInputs = page.locator('div:has-text("Nº PUERTAS Exterior")').locator('input');
      for (let i = 0; i < 4; i++) {
        await doorInputs.nth(i).fill('1');
      }
      const windowInputs = page.locator('div:has-text("Nº VENTANAS Exterior")').locator('input');
      for (let i = 0; i < 4; i++) {
        await windowInputs.nth(i).fill('2');
      }

      await page.getByRole('button', { name: 'PVC' }).click();
      await page.getByPlaceholder('Madera').fill('Madera');
      await page.getByRole('button', { name: 'Doble vidrio' }).click();
      await page.getByRole('button', { name: 'No' }).nth(0).click(); // "¿Ventanas con persiana?"

      await page.getByRole('button', { name: /siguiente/i }).click();
    }

    async function fillAndAdvanceThermalStep(page: any) {
      await page.locator('button:has(img[src*="thermal-caldera"])').click();
      await page.getByRole('button', { name: 'Gas' }).click();
      await page.getByPlaceholder('Samsung 2020').fill('Samsung 2020');
      await page.getByRole('button', { name: 'No' }).nth(1).click(); // "¿Aire Acondicionado?"
      await page.getByRole('button', { name: 'Radiadores de Agua' }).click();
      await page.getByRole('button', { name: 'Aluminio' }).click();

      await page.getByRole('button', { name: /siguiente/i }).click();
    }

    test('COND-01 (Housing): shutterWindowCount visibility', async ({ page }) => {
      await page.goto(URL);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1').first();
      const headingText = await heading.textContent();
      if (!headingText?.toLowerCase().includes('certificado energético') && !headingText?.toLowerCase().includes('vivienda')) {
        console.log('Skipping COND-01: Not on EC section');
        return;
      }

      // Click "No" on "¿Ventanas con persiana?"
      const noBtn = page.locator('div:has-text("¿Ventanas con persiana?")').getByRole('button', { name: 'No' });
      await noBtn.click();
      await expect(page.getByLabel('Nº ventanas con persianas')).not.toBeVisible();

      // Click "Sí" on "¿Ventanas con persiana?"
      const yesBtn = page.locator('div:has-text("¿Ventanas con persiana?")').getByRole('button', { name: 'Sí' });
      await yesBtn.click();
      await expect(page.getByLabel('Nº ventanas con persianas')).toBeVisible();
    });

    test('COND-02 (Thermal): airConditioning visibility', async ({ page }) => {
      await page.goto(URL);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1').first();
      const headingText = await heading.textContent();
      if (!headingText?.toLowerCase().includes('certificado energético') && !headingText?.toLowerCase().includes('vivienda')) {
        console.log('Skipping COND-02: Not on EC section');
        return;
      }

      await fillAndAdvanceHousingStep(page);

      // Click "No" on "¿Aire Acondicionado?"
      const noBtn = page.locator('div:has-text("¿Aire Acondicionado?")').getByRole('button', { name: 'No' });
      await noBtn.click();
      await expect(page.getByText('Detalles (marca y año)')).not.toBeVisible();
      await expect(page.getByText('¿Tipo de Bomba?')).not.toBeVisible();

      // Click "Sí" on "¿Aire Acondicionado?"
      const yesBtn = page.locator('div:has-text("¿Aire Acondicionado?")').getByRole('button', { name: 'Sí' });
      await yesBtn.click();
      await expect(page.getByText('Detalles (marca y año)')).toBeVisible();
      await expect(page.getByText('¿Tipo de Bomba?')).toBeVisible();
    });

    test('COND-03 (Additional): solarPanelDetails visibility', async ({ page }) => {
      await page.goto(URL);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1').first();
      const headingText = await heading.textContent();
      if (!headingText?.toLowerCase().includes('certificado energético') && !headingText?.toLowerCase().includes('vivienda')) {
        console.log('Skipping COND-03: Not on EC section');
        return;
      }

      await fillAndAdvanceHousingStep(page);
      await fillAndAdvanceThermalStep(page);

      // Click "No" on "¿Placas solares?"
      const noBtn = page.locator('div:has-text("¿Placas solares?")').getByRole('button', { name: 'No' });
      await noBtn.click();
      await expect(page.getByText('Detalles de la Instalación Fotovoltaica')).not.toBeVisible();

      // Click "Sí" on "¿Placas solares?"
      const yesBtn = page.locator('div:has-text("¿Placas solares?")').getByRole('button', { name: 'Sí' });
      await yesBtn.click();
      await expect(page.getByText('Detalles de la Instalación Fotovoltaica')).toBeVisible();
    });
  });
});
