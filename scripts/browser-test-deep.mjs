/**
 * Deep browser test against the live Eltex app.
 * Covers full form flow, sections, upload validation, dashboard, and edge cases.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const APP_URL = process.env.APP_URL || 'http://localhost:5000';
const CHROMIUM_EXEC = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

// Test project tokens from backend server startup logs
const PROJECTS = [
  { code: 'ELT20250001', token: 'b43df737-e202-40d8-ba45-277dceb9d323', phone: '+34612345678', type: 'solar' },
  { code: 'ELT20250002', token: '1be9964d-a51d-4532-8f7e-647bb7aeb5f3', phone: '+34623456789', type: 'aerothermal' },
  { code: 'ELT20250003', token: '18b8f66e-975e-4ddf-a486-04ad4907b8ad', phone: '+34655443322', type: 'solar' },
];

const results = [];
let browser, context, page;

function pass(name, detail = '') {
  results.push({ status: 'PASS', name, detail });
  console.log(`  ✅ PASS: ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(name, detail = '') {
  results.push({ status: 'FAIL', name, detail });
  console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
}

function warn(name, detail = '') {
  results.push({ status: 'WARN', name, detail });
  console.log(`  ⚠️  WARN: ${name}${detail ? ' — ' + detail : ''}`);
}

function info(msg) {
  console.log(`     ℹ  ${msg}`);
}

async function goto(path = '/') {
  await page.goto(`${APP_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(500);
}

async function getErrorText() {
  try {
    const el = page.locator('p.text-red-500').first();
    if (await el.isVisible({ timeout: 1500 })) return (await el.textContent()).trim();
  } catch {}
  return null;
}

async function getVisibleText() {
  return page.locator('body').innerText().catch(() => '');
}

async function createFakeImageFile(filename = 'test-doc.jpg') {
  // Write a minimal valid JPEG to /tmp for upload testing
  const path = `/tmp/${filename}`;
  // Minimal 1x1 white JPEG
  const jpegBytes = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC' +
    'AABAAEDASIA2gABAREA/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEA/8QAIhAAAQMEAgMAAAAAAAAAAAAAAQIDBBEhBRIxQWH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEB' +
    'AAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Amz16xjkMlqiLrY0A7oagMnb1gFRmKLkDWh2gD5vGgCaEpVnSomvqsBzjhQBn/9k=',
    'base64'
  );
  writeFileSync(path, jpegBytes);
  return path;
}

async function createFakePdfFile(filename = 'test-doc.pdf') {
  const path = `/tmp/${filename}`;
  const pdfContent = '%PDF-1.4\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<</Size 4 /Root 1 0 R>>\nstartxref\n190\n%%EOF';
  writeFileSync(path, pdfContent);
  return path;
}

// ─────────────────────────────────────────────────────────────
// SUITE 1: API endpoints health check
// ─────────────────────────────────────────────────────────────
async function testApiHealth() {
  console.log('\n🔌 API HEALTH CHECK');

  // /api/health
  {
    const res = await page.request.get(`${APP_URL}/api/health`);
    res.status() === 200 ? pass('GET /api/health', `status 200`) : fail('GET /api/health', `status ${res.status()}`);
  }

  // /api/lookup/phone/:phone — correct path, phone is URL-encoded in path segment
  {
    const res = await page.request.get(`${APP_URL}/api/lookup/phone/${encodeURIComponent('+34612345678')}`);
    res.status() === 200 ? pass('GET /api/lookup/phone/+34612345678', 'status 200') : fail('GET /api/lookup/phone/+34612345678', `status ${res.status()}`);
  }

  {
    const res = await page.request.get(`${APP_URL}/api/lookup/phone/DOESNOTEXIST999`);
    res.status() === 404 ? pass('GET /api/lookup/phone/DOESNOTEXIST999', 'returns 404') : fail('GET /api/lookup/phone/DOESNOTEXIST999', `expected 404, got ${res.status()}`);
  }

  // /api/project/:code — token must be in x-project-token header
  {
    const res = await page.request.get(`${APP_URL}/api/project/ELT20250001`, {
      headers: { 'x-project-token': 'b43df737-e202-40d8-ba45-277dceb9d323' }
    });
    res.status() === 200 ? pass('GET /api/project/ELT20250001 with valid header token', 'status 200') : fail('GET /api/project/ELT20250001 with valid header token', `status ${res.status()}`);
  }

  // Wrong token via header
  {
    const res = await page.request.get(`${APP_URL}/api/project/ELT20250001`, {
      headers: { 'x-project-token': 'wrong-token' }
    });
    [401, 403].includes(res.status()) ? pass('GET /api/project with wrong header token → 403', `status ${res.status()}`) : fail('GET /api/project with wrong header token', `expected 403, got ${res.status()}`);
  }

  // No token at all
  {
    const res = await page.request.get(`${APP_URL}/api/project/ELT20250001`);
    [401, 403].includes(res.status()) ? pass('GET /api/project with no token → 403', `status ${res.status()}`) : fail('GET /api/project with no token', `expected 403, got ${res.status()}`);
  }

  // Non-existent code
  {
    const res = await page.request.get(`${APP_URL}/api/project/FAKECODE`, {
      headers: { 'x-project-token': 'faketoken' }
    });
    res.status() === 404 ? pass('GET /api/project/FAKECODE → 404') : fail('GET /api/project/FAKECODE', `expected 404, got ${res.status()}`);
  }

  // ── SECURITY: Missing accessToken field bypass check ──────────────────────
  // If a project somehow has no accessToken, the middleware currently lets it through.
  // Verify the real projects DO have accessTokens by checking the lookup response.
  {
    const res = await page.request.get(`${APP_URL}/api/lookup/phone/${encodeURIComponent('+34612345678')}`);
    if (res.status() === 200) {
      const body = await res.json();
      if (body.project?.accessToken) {
        pass('Lookup response includes accessToken (for client use)', `token present`);
      } else {
        fail('Lookup response missing accessToken', 'client cannot authenticate subsequent requests — SECURITY RISK');
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 2: Full form navigation with test project
// ─────────────────────────────────────────────────────────────
async function testFormNavigation() {
  console.log('\n🧭 FORM NAVIGATION TESTS');

  const proj = PROJECTS[0];
  await goto(`/?code=${proj.code}&token=${proj.token}`);
  await page.waitForTimeout(1500);

  const bodyText = await getVisibleText();

  // Check that we're past the phone step (app should advance to docs)
  const isOnDocsPage = bodyText.includes('DNI') || bodyText.includes('NIE') || bodyText.includes('documento') || bodyText.includes('IBI');
  const isOnPhonePage = bodyText.includes('Teléfono') && bodyText.includes('expediente');

  if (isOnDocsPage) {
    pass('Token URL bypasses phone step and loads project docs page');
  } else if (isOnPhonePage) {
    warn('Token URL redirected to phone page', 'project may have been reset or token changed');
  } else {
    info(`Page content: ${bodyText.slice(0, 200)}`);
    fail('Token URL did not load expected content');
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 3: Phone → Project lookup flow
// ─────────────────────────────────────────────────────────────
async function testPhoneLookupFlow() {
  console.log('\n📞 PHONE LOOKUP FLOW TESTS');

  for (const proj of PROJECTS) {
    await goto('/');
    const phoneInput = page.locator('input[type="tel"]');
    await phoneInput.fill(proj.phone);
    await page.locator('button:has-text("Continuar")').click();
    await page.waitForTimeout(2500);

    const url = page.url();
    const bodyText = await getVisibleText();

    if (url.includes('code=') || bodyText.includes('DNI') || bodyText.includes('documento')) {
      pass(`Phone lookup: ${proj.phone} (${proj.type})`, 'found project and advanced');
    } else if (bodyText.includes('Nuevo expediente') || bodyText.includes('no encontrado')) {
      fail(`Phone lookup: ${proj.phone}`, 'project not found — might need seed data');
    } else {
      const errText = await getErrorText();
      if (errText) {
        fail(`Phone lookup: ${proj.phone}`, `error: ${errText}`);
      } else {
        warn(`Phone lookup: ${proj.phone}`, `unexpected state, url=${url}`);
      }
    }
  }

  // Test unknown phone
  await goto('/');
  await page.locator('input[type="tel"]').fill('+34999000000');
  await page.locator('button:has-text("Continuar")').click();
  await page.waitForTimeout(2500);
  const bodyText = await getVisibleText();
  if (bodyText.includes('encontrado') || bodyText.includes('encontrar') || bodyText.includes('error') || bodyText.includes('Nuevo')) {
    pass('Unknown phone shows appropriate "not found" message');
  } else {
    const errText = await getErrorText();
    info(`Unknown phone result: ${errText ?? bodyText.slice(0, 100)}`);
    warn('Unknown phone did not show clear "not found" state');
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 4: Document upload section — file type restrictions
// ─────────────────────────────────────────────────────────────
async function testUploadSection() {
  console.log('\n📤 UPLOAD SECTION TESTS');

  const proj = PROJECTS[0];
  await goto(`/?code=${proj.code}&token=${proj.token}`);
  await page.waitForTimeout(2000);

  const bodyText = await getVisibleText();
  if (!bodyText.includes('DNI') && !bodyText.includes('NIE') && !bodyText.includes('documento')) {
    warn('Upload section not reached — skipping upload tests');
    return;
  }

  pass('Upload section loaded with property docs content');

  // Check file inputs exist
  const fileInputs = page.locator('input[type="file"]');
  const count = await fileInputs.count();
  info(`Found ${count} file input(s) on the page`);

  if (count > 0) {
    // Check accepted file types
    const acceptAttr = await fileInputs.first().getAttribute('accept');
    info(`First file input accept: "${acceptAttr}"`);

    if (acceptAttr && (acceptAttr.includes('image') || acceptAttr.includes('pdf'))) {
      pass('File input has proper accept attribute', acceptAttr);
    } else if (acceptAttr === null) {
      warn('File input has no accept attribute', 'any file type allowed — should restrict to images/PDFs');
    } else {
      fail('File input accept attribute unexpected', acceptAttr);
    }
  } else {
    // File inputs may be hidden / trigger-based — look for upload zones
    const dropZones = page.locator('[class*="drop"], [class*="upload"], [class*="zone"]');
    const dzCount = await dropZones.count();
    if (dzCount > 0) {
      pass(`Found ${dzCount} drop zone(s) for file uploads`);
    } else {
      warn('No file inputs or drop zones immediately visible (may need interaction)');
    }
  }

  // Check for DNI/NIE section label
  const hasDniLabel = bodyText.includes('DNI') || bodyText.includes('NIE') || bodyText.includes('Identidad');
  if (hasDniLabel) {
    pass('DNI/NIE upload section label visible');
  } else {
    fail('DNI/NIE label not visible in docs section');
  }

  // Check for IBI section
  const hasIbiLabel = bodyText.includes('IBI') || bodyText.includes('catastral') || bodyText.includes('propiedad');
  if (hasIbiLabel) {
    pass('IBI/property document section visible');
  } else {
    warn('IBI section not immediately visible (may be further down or behind step)');
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 5: Solar vs Aerothermal project differences
// ─────────────────────────────────────────────────────────────
async function testProjectTypeDifferences() {
  console.log('\n⚡ SOLAR vs AEROTHERMAL CONTENT TESTS');

  for (const proj of PROJECTS.slice(0, 2)) {
    await goto(`/?code=${proj.code}&token=${proj.token}`);
    await page.waitForTimeout(2000);

    const bodyText = await getVisibleText();
    info(`${proj.type.toUpperCase()} (${proj.code}) page content (first 400 chars): ${bodyText.slice(0, 400)}`);

    if (bodyText.includes('DNI') || bodyText.includes('documento')) {
      pass(`${proj.type} project loads document collection page`);
    } else {
      warn(`${proj.type} project did not reach document page`, bodyText.slice(0, 100));
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 6: Dashboard access
// ─────────────────────────────────────────────────────────────
async function testDashboard() {
  console.log('\n📊 DASHBOARD TESTS');

  await goto('/dashboard');
  await page.waitForTimeout(1500);

  const url = page.url();
  const bodyText = await getVisibleText();

  // Check if password protected
  const hasPasswordPrompt = bodyText.includes('contraseña') || bodyText.includes('password') || bodyText.includes('Password');
  const hasDashboardContent = bodyText.includes('Expedientes') || bodyText.includes('Proyectos') || bodyText.includes('Dashboard');

  if (hasPasswordPrompt) {
    pass('Dashboard is password protected', 'login wall shown');

    // Try to login without a password to verify protection
    const passInput = page.locator('input[type="password"]');
    if (await passInput.isVisible({ timeout: 2000 })) {
      await passInput.fill('wrongpassword');
      await page.locator('button[type="submit"], button:has-text("Acceder"), button:has-text("Login")').first().click();
      await page.waitForTimeout(1000);
      const afterLoginText = await getVisibleText();
      if (afterLoginText.includes('Expedientes') || afterLoginText.includes('Proyectos')) {
        fail('Dashboard accessible with wrong password — SECURITY ISSUE');
      } else {
        pass('Dashboard rejects wrong password');
      }
    }
  } else if (hasDashboardContent) {
    pass('Dashboard accessible', 'shows project content');

    // Check project list
    const projectRows = page.locator('tr, [class*="project"], [class*="row"]');
    const rowCount = await projectRows.count();
    info(`Found ${rowCount} rows/items on dashboard`);

    // Check search functionality
    const searchInput = page.locator('input[type="search"], input[placeholder*="buscar"], input[placeholder*="Buscar"], input[placeholder*="teléfono"], input[placeholder*="search"]').first();
    if (await searchInput.isVisible({ timeout: 1500 }).catch(() => false)) {
      await searchInput.fill('+34612345678');
      await page.waitForTimeout(800);
      const resultText = await getVisibleText();
      if (resultText.includes('ELT20250001') || resultText.includes('612345678')) {
        pass('Dashboard search finds project by phone number');
      } else {
        warn('Dashboard search may not be filtering correctly', 'no ELT20250001 found after searching +34612345678');
      }
    } else {
      info('Search input not found on dashboard');
    }
  } else {
    fail('Dashboard shows neither password prompt nor content', bodyText.slice(0, 200));
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 7: Responsive / mobile viewport
// ─────────────────────────────────────────────────────────────
async function testMobileViewport() {
  console.log('\n📱 MOBILE VIEWPORT TESTS');

  await page.setViewportSize({ width: 375, height: 812 }); // iPhone X

  await goto('/');
  await page.waitForTimeout(800);

  const phoneInput = page.locator('input[type="tel"]');
  const continueBtn = page.locator('button:has-text("Continuar")');

  if (await phoneInput.isVisible()) {
    pass('Phone input visible on mobile viewport');
  } else {
    fail('Phone input not visible on mobile viewport');
  }

  if (await continueBtn.isVisible()) {
    pass('Continue button visible on mobile viewport');
  } else {
    fail('Continue button not visible on mobile viewport — may be off-screen');
  }

  // Check nothing overflows horizontally
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewWidth = 375;
  if (scrollWidth <= viewWidth + 5) { // 5px tolerance
    pass('No horizontal overflow on mobile', `scrollWidth=${scrollWidth}`);
  } else {
    fail('Horizontal overflow on mobile', `scrollWidth=${scrollWidth} > viewWidth=${viewWidth}`);
  }

  // Reset viewport
  await page.setViewportSize({ width: 1280, height: 800 });
}

// ─────────────────────────────────────────────────────────────
// SUITE 8: Security — token bypass attempts
// ─────────────────────────────────────────────────────────────
async function testSecurityTokens() {
  console.log('\n🔒 SECURITY TOKEN TESTS');

  // Correct code + wrong token in header
  {
    const res = await page.request.get(`${APP_URL}/api/project/ELT20250001`, {
      headers: { 'x-project-token': 'wrongtoken' }
    });
    [401, 403].includes(res.status())
      ? pass('Project API rejects wrong token', `status ${res.status()}`)
      : fail('Project API accepted wrong token — SECURITY ISSUE', `status ${res.status()}`);
  }

  // No token at all
  {
    const res = await page.request.get(`${APP_URL}/api/project/ELT20250001`);
    [401, 403].includes(res.status())
      ? pass('Project API rejects missing token', `status ${res.status()}`)
      : fail('Project API works without token — SECURITY ISSUE', `status ${res.status()}`);
  }

  // SQL injection / traversal attempt in phone lookup path
  {
    const res = await page.request.get(`${APP_URL}/api/lookup/phone/${encodeURIComponent("' OR 1=1--")}`);
    [400, 404].includes(res.status())
      ? pass('Phone lookup: SQL injection attempt returns 400/404', `status ${res.status()}`)
      : warn('Phone lookup SQL injection', `status ${res.status()} — verify no data leaked`);
  }

  // Path traversal attempt — Express router should reject or 404
  {
    const res = await page.request.get(`${APP_URL}/api/project/%2F..%2F..%2Fetc%2Fpasswd`, {
      headers: { 'x-project-token': 'x' }
    });
    res.status() >= 400
      ? pass('Project API rejects path traversal attempt', `status ${res.status()}`)
      : fail('Project API may be vulnerable to path traversal', `status ${res.status()}`);
  }

  // Oversized phone number (fuzzing)
  {
    const hugeName = '+34' + '6'.repeat(200);
    const res = await page.request.get(`${APP_URL}/api/lookup/phone/${encodeURIComponent(hugeName)}`);
    res.status() >= 400
      ? pass('Lookup handles huge phone number gracefully', `status ${res.status()}`)
      : warn('Lookup accepts very long phone number', `status ${res.status()} — consider length validation`);
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 9: Network resilience — 404 / not-found handling
// ─────────────────────────────────────────────────────────────
async function testNotFoundHandling() {
  console.log('\n🚫 NOT-FOUND / ERROR HANDLING TESTS');

  await goto('/nonexistent-page');
  await page.waitForTimeout(800);

  const bodyText = await getVisibleText();
  const status = await page.evaluate(() => window.location.pathname);

  if (bodyText.includes('404') || bodyText.includes('No encontrada') || bodyText.includes('not found')) {
    pass('App shows 404 page for unknown route');
  } else if (bodyText.includes('Teléfono') || bodyText.includes('expediente')) {
    pass('App redirects unknown routes to home (SPA behaviour)');
  } else {
    warn('Unknown route handling unclear', bodyText.slice(0, 100));
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 10: Form state persistence across navigation
// ─────────────────────────────────────────────────────────────
async function testFormStatePersistence() {
  console.log('\n💾 FORM STATE PERSISTENCE TESTS');

  const proj = PROJECTS[0];
  const startUrl = `/?code=${proj.code}&token=${proj.token}`;

  await goto(startUrl);
  await page.waitForTimeout(1500);

  const bodyBefore = await getVisibleText();
  const hadDocContent = bodyBefore.includes('DNI') || bodyBefore.includes('documento');

  if (!hadDocContent) {
    info('Not on docs page — skipping persistence test');
    return;
  }

  // Reload and check state is preserved
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const bodyAfter = await getVisibleText();
  const stillHasDocContent = bodyAfter.includes('DNI') || bodyAfter.includes('documento');

  if (stillHasDocContent) {
    pass('Form section preserved after page reload');
  } else {
    warn('Form section lost on reload', 'user may be sent back to start — check session/token handling');
  }
}

// ─────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 DEEP BROWSER TESTS — against:', APP_URL);

  try {
    browser = await chromium.launch({
      executablePath: CHROMIUM_EXEC || undefined,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    page = await context.newPage();
    page.setDefaultTimeout(12000);

    await testApiHealth();
    await testFormNavigation();
    await testPhoneLookupFlow();
    await testUploadSection();
    await testProjectTypeDifferences();
    await testDashboard();
    await testMobileViewport();
    await testSecurityTokens();
    await testNotFoundHandling();
    await testFormStatePersistence();

  } catch (err) {
    console.error('\n💥 Test runner crashed:', err.message);
    console.error(err.stack);
  } finally {
    await browser?.close();
  }

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  console.log('\n' + '═'.repeat(70));
  console.log(`📊 RESULTS: ${passed} passed  ${failed} failed  ${warned} warnings  (${results.length} total)`);

  if (failed > 0) {
    console.log('\n🔴 FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r =>
      console.log(`  • [FAIL] ${r.name}: ${r.detail}`)
    );
  }

  if (warned > 0) {
    console.log('\n🟡 WARNINGS:');
    results.filter(r => r.status === 'WARN').forEach(r =>
      console.log(`  • [WARN] ${r.name}: ${r.detail}`)
    );
  }

  console.log('═'.repeat(70));
  process.exit(failed > 0 ? 1 : 0);
})();
