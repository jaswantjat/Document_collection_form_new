import { Page } from '@playwright/test';

export async function waitForAppReady(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.readyState === 'complete');
}

export function projectUrl(code: string, token?: string) {
  const params = new URLSearchParams({ code });
  if (token) params.set('token', token);
  return `/?${params}`;
}
