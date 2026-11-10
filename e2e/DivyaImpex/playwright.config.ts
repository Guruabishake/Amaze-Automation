import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * Dedicated Playwright config for the DivyaImpex suite. Independent of the root config and of
 * e2e/AmazerTrans/playwright.config.ts. Like AmazerTrans, the app allows only one active session
 * per account, so execution is strictly serial (workers: 1, no retries - a retry is a second login).
 *
 * Run: npx playwright test --config=e2e/DivyaImpex/playwright.config.ts
 */
export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  outputDir: path.join(__dirname, 'reports', 'test-results'),
  timeout: 15 * 60 * 1000,
  expect: { timeout: 15000 },
  // Hard cap for a whole run: a hung browser/teardown once held a run for 3 hours; this fails it instead.
  globalTimeout: 90 * 60 * 1000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: path.join(__dirname, 'reports', 'html'), open: 'never' }],
    ['list'],
  ],
  use: {
    headless: process.env.HEADLESS !== undefined ? process.env.HEADLESS === 'true' : !!process.env.CI,
    viewport: { width: 1600, height: 900 },
    // BROWSER_CHANNEL=chrome runs the installed Google Chrome instead of Playwright's bundled Chromium.
    channel: (process.env.BROWSER_CHANNEL as 'chrome' | 'msedge' | undefined) || undefined,
    actionTimeout: 30000,
    navigationTimeout: 60000,
    screenshot: 'only-on-failure',
    video: (process.env.VIDEO as 'off' | 'on' | 'retain-on-failure' | 'on-first-retry') || 'on',
    trace: 'retain-on-failure',
    launchOptions: { slowMo: Number(process.env.SLOW_MO) || 0 },
  },
  // scenario1 = Enquiry flow (export-sea-FCL.spec.ts); scenario2 = Quote Generation -> Master Job, which
  // depends on scenario1 so `--project=scenario2` always runs on a freshly initiated quote.
  projects: [
    { name: 'scenario1', testMatch: /export-sea-FCL\.spec\.ts$/, use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } },
    { name: 'negative', testMatch: /export-sea-FCL-negative\.spec\.ts$/, use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } },
    {
      name: 'scenario2',
      testMatch: /export-sea-FCL-quote-to-job\.spec\.ts$/,
      dependencies: ['scenario1'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } },
    },
    {
      // No `dependencies`: Playwright skips dependants of a failing project, and Scenario 3 reports a known application
      // defect (Booking Edit Destination not saved). Scenario 4 reads Scenario 3's handoff and refuses a stale/processed job.
      // Fresh chain: --project=scenario3 --project=scenario4 (runs in this order with one worker).
      name: 'scenario4',
      testMatch: /export-sea-FCL-stuffing-to-vendor-bill\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } },
    },
    {
      name: 'scenario3',
      testMatch: /export-sea-FCL-cb-stuffing\.spec\.ts$/,
      dependencies: ['scenario2'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } },
    },
  ],
});
