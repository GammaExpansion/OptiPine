import { defineConfig } from '@playwright/test';
import { origins } from './e2e/ports.ts';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  // CI's default reporter prints nothing until the run ends, so a slow or stuck test was silent:
  // there each test is listed as it ends, and the HTML report is uploaded beside the results.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: origins.production,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  globalSetup: './e2e/setup.ts',
});
