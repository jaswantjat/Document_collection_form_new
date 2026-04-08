import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

test.describe('Bug Regressions', () => {

  test('REG-01: international phone format (+44, +33, +1) accepted by backend normalizePhone', async ({ request }) => {
    const phones = ['+447700900000', '+33612345678', '+12025550123'];
    
    for (const phone of phones) {
      const res = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent(phone)}`);
      // It might be 404 (not found) but it shouldn't be 400 (bad request) or 500
      expect([200, 404]).toContain(res.status());
    }
  });

  test('REG-02: /api/project/:code stays code-based even if a stray x-project-token header is present', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/project/ELT20250001`, {
      headers: { 'x-project-token': 'wrong-token' }
    });
    
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.project?.code).toBe('ELT20250001');
  });

  test('REG-03: international phone format is accepted by backend (not rejected as invalid)', async ({ request }) => {
    // These phones are not in the DB, so they return 404 NOT_FOUND.
    // The key assertion: they must NOT return 400/500 (format rejection / server crash).
    // 404 = phone format valid, number simply not registered.
    const phones = ['+447700900000', '+33612345678', '+12025550123'];
    for (const phone of phones) {
      const res = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent(phone)}`, {
        failOnStatusCode: false,
      });
      // Must be 200 (found) or 404 (not found) — never 400 or 500
      expect([200, 404]).toContain(res.status());
      const body = await res.json();
      // If 404, it must be NOT_FOUND (parsed correctly) — not a server error
      if (res.status() === 404) {
        expect(body.error).toBe('NOT_FOUND');
      }
      console.log(`[REG-03] ${phone} → HTTP ${res.status()}, error: ${body.error ?? 'n/a'}`);
    }
  });
});
