import { test, expect } from '@playwright/test';

test.describe('Bug Regressions', () => {

  test('REG-01: international phone format (+44, +33, +1) accepted by backend normalizePhone', async ({ request }) => {
    const phones = ['+447700900000', '+33612345678', '+12025550123'];
    
    for (const phone of phones) {
      const res = await request.get(`http://localhost:3001/api/lookup/phone/${encodeURIComponent(phone)}`);
      // It might be 404 (not found) but it shouldn't be 400 (bad request) or 500
      expect([200, 404]).toContain(res.status());
    }
  });

  test('REG-02: /api/project/:code with wrong token returns 401/403 (not 200)', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/project/ELT20250001', {
      headers: { 'x-project-token': 'wrong-token' }
    });
    
    expect([401, 403]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('REG-03: international phone format is accepted by backend (not rejected as invalid)', async ({ request }) => {
    // These phones are not in the DB, so they return 404 NOT_FOUND.
    // The key assertion: they must NOT return 400/500 (format rejection / server crash).
    // 404 = phone format valid, number simply not registered.
    const phones = ['+447700900000', '+33612345678', '+12025550123'];
    for (const phone of phones) {
      const res = await request.get(`http://localhost:3001/api/lookup/phone/${encodeURIComponent(phone)}`, {
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
