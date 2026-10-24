import { defineConfig } from '@playwright/test';

// Explicit URLs use a server the caller owns; never attach to an unrelated port.
const baseURL = process.env.MORI_BASE_URL || 'http://127.0.0.1:4175';

export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.js',
  fullyParallel: true,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    // Set PLAYWRIGHT_CHANNEL=chrome to use an already installed Chrome.
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: process.env.MORI_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 4175',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
