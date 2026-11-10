import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // AmazerTrans has its own dedicated config (e2e/AmazerTrans/playwright.config.ts) with a
  // config-driven, per-user account architecture - every spec there logs in with a real account
  // via a fixture whose DEFAULT resolves to a genuine, real credential. Confirmed live: running
  // pricing.spec.ts through THIS root config (e.g. a bare `npx playwright test
  // e2e/AmazerTrans/tests/pricing.spec.ts` with no --config flag) makes every one of the 7 browser
  // projects below fall back to that same default account, so a single accidental bare invocation
  // opens 7 simultaneous sessions on one account - on top of whatever the dedicated config is
  // already running - and the app allows only one active session per account. Excluding
  // e2e/AmazerTrans here forces every invocation through its own config, which is the only
  // correct way to run it anyway. DivyaImpex (e2e/DivyaImpex/playwright.config.ts) is excluded for
  // the same single-session reason.
  testIgnore: ['**/AmazerTrans/**', '**/DivyaImpex/**'],
  timeout: 100000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list'],
    ['allure-playwright'],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    // HEADLESS=true / HEADLESS=false overrides the CI-based default below without touching this file.
    headless: process.env.HEADLESS !== undefined ? process.env.HEADLESS === 'true' : !!process.env.CI,
    screenshot: 'only-on-failure',
    // VIDEO=off | on | retain-on-failure | on-first-retry overrides the default below.
    video: (process.env.VIDEO as 'off' | 'on' | 'retain-on-failure' | 'on-first-retry') || 'retain-on-failure',
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
    // SLOW_MO=300 (ms) slows down each Playwright action for manual observation; 0 (default) is unthrottled.
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO) || 0,
    },
  },

  /* Configure projects for major browsers */
  projects: [
    /* Desktop browsers */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Mobile browsers */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },

    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* Tablet browsers */
    {
      name: 'iPad',
      use: { ...devices['iPad Pro'] },
    },

    {
      name: 'iPad Mini',
      use: { ...devices['iPad Mini'] },
    },
  ],
});
