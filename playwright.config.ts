import { defineConfig, devices } from '@playwright/test';

const chromiumExecutable = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5000';
const ldLibraryPath = [
  process.env.REPLIT_LD_LIBRARY_PATH,
  process.env.LD_LIBRARY_PATH,
]
  .filter(Boolean)
  .join(':');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: chromiumExecutable,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-features=VizDisplayCompositor',
          ],
          env: {
            LD_LIBRARY_PATH: ldLibraryPath,
            SSL_CERT_FILE: process.env.SSL_CERT_FILE ?? '/etc/ssl/certs/ca-bundle.crt',
          },
        },
        headless: true,
      },
    },
  ],
});
