import type { Page, Route } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const API_ORIGIN = new URL(API_BASE).origin;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientProxyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|EPIPE|socket hang up|fetch failed|UND_ERR_SOCKET|ETIMEDOUT/i.test(message);
}

async function fulfillFromBackend(route: Route) {
  const requestUrl = new URL(route.request().url());
  const request = route.request();
  const headers = { ...request.headers() };

  delete headers.host;
  delete headers['content-length'];

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`${API_ORIGIN}${requestUrl.pathname}${requestUrl.search}`, {
        method: request.method(),
        headers,
        body: request.postDataBuffer() ?? undefined,
        signal: AbortSignal.timeout(30000),
      });
      break;
    } catch (error) {
      if (!isTransientProxyError(error) || attempt === 2) throw error;
      await delay(250 * (attempt + 1));
    }
  }

  if (!response) {
    throw new Error(`Proxy fetch returned no response for ${requestUrl.pathname}`);
  }

  const body = Buffer.from(await response.arrayBuffer());

  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  });
}

export async function bindPageToE2EBackend(page: Page) {
  // Keep browser traffic aligned with E2E_API_BASE_URL even when the dev-server
  // proxy was started against a different backend.
  await page.route('**/api/**', fulfillFromBackend);
  await page.route('**/uploads/**', fulfillFromBackend);
  await page.route('**/health', fulfillFromBackend);
}
