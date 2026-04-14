import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const PROJECT_CODE = 'ELT20250005';

test.describe('Property docs contract removal', () => {
  test('initial intake no longer shows the contract upload or counts it in progress', async ({ page, request }) => {
    const resetRes = await request.post(`${API_BASE}/api/test/reset-property-docs/${PROJECT_CODE}`);
    expect(resetRes.ok()).toBeTruthy();

    await page.goto(`/?code=${PROJECT_CODE}`);

    await expect(page.locator('h1').first()).toContainText('Documentos');
    await expect(page.getByTestId('contract-card')).toHaveCount(0);
    await expect(page.getByText('Contrato Eltex', { exact: true })).toHaveCount(0);
    await expect(page.locator('span.tabular-nums').first()).toHaveText('0 de 3');
  });

  test('customers can progress past intake with no contract data present', async ({ page, request }) => {
    const restoreRes = await request.post(`${API_BASE}/api/test/restore-base-flow/${PROJECT_CODE}`);
    expect(restoreRes.ok()).toBeTruthy();

    await page.goto(`/?code=${PROJECT_CODE}`);

    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
    await expect(page.getByText('Contrato Eltex', { exact: true })).toHaveCount(0);
  });
});
