import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import { loadUsersConfig } from '../shared/multiUser/loadUsersConfig';
import { buildUserProjects } from '../shared/multiUser/buildUserProjects';
import { ResolvedUserAccount } from '../shared/multiUser/types';

/**
 * Dedicated Playwright config for the AmazerTrans suite (e2e/AmazerTrans/tests) - deliberately
 * separate from the root playwright.config.ts, which other unrelated suites (Global-X, new_folder,
 * Amazers, root example specs) also depend on and must not be affected by this.
 *
 * Why this file exists: the staging AmazerTrans app enforces a real Single Active Session per User
 * rule (confirmed live, repeatedly, via its own "Duplicate Session Detected" / Force Login dialog) -
 * only one login can be active for a given account at a time. Every spec under e2e/AmazerTrans/tests
 * (customer, vendor, enquiry, quotation, pricing, login, customer-vendor-e2e) logs in with the SAME
 * single account by default - so this file keeps `workers: 1` as its own protective default
 * (never CI-conditional, unlike the root config) rather than relying on a remembered CLI flag.
 *
 * Multi-user parallel execution (pricing.spec.ts only, so far) is layered on top of that same-account
 * default via a GENERIC, config-driven engine in e2e/shared/multiUser - not hardcoded to any fixed
 * user count. e2e/AmazerTrans/config/users.config.json lists any number of user entries (add/remove
 * freely, no code change); `buildUserProjects()` turns every ENABLED entry into its own Playwright
 * project (1 enabled user -> 1 project, 10 enabled users -> 10 projects), each with its own
 * `userAccount` (username/password resolved from the env var names that entry names, branch,
 * environment/base URL, browser). Disabling a user in the JSON simply removes its project - it
 * cannot run, not "runs but is skipped". Running several of those projects together is only safe
 * when each genuinely resolves to a different real account - the app allows only one active session
 * per account, and this architecture's whole point is to never let two projects share one.
 *
 * Retries are hard-disabled (not CI-conditional) rather than relied on to paper over flakiness: a
 * retry re-launches a fresh browser and repeats the same login with the same account, which is
 * itself a second login and can produce exactly the same Duplicate-Session conflict this config
 * exists to prevent.
 *
 * `use`/`reporter` are intentionally identical to the root config (same Allure/HTML/list reporters,
 * same screenshot/video/trace/headless/slowMo behavior) - this file only changes execution
 * parallelism and per-user account wiring, not reporting or business behavior.
 */
const USERS_CONFIG_PATH = path.join(__dirname, 'config', 'users.config.json');
const usersConfig = loadUsersConfig(USERS_CONFIG_PATH);
const FALLBACK_BASE_URL = usersConfig.environments?.default || 'https://staging-fc.cargowayz.net/login/AMAZERTRANS';

export default defineConfig<{ userAccount: ResolvedUserAccount }>({
  // Absolute, not './tests': confirmed live that a relative testDir gets re-resolved against
  // wherever Playwright actually discovered a config file (e.g. the redirect stub in
  // e2e/AmazerTrans/tests/playwright.config.ts), not against this file's own directory - which
  // would silently point testDir at a nonexistent e2e/AmazerTrans/tests/tests. Absolute removes
  // the ambiguity regardless of which file Playwright resolves.
  testDir: path.join(__dirname, 'tests'),
  // Playwright defaults outputDir to "<this config's directory>/test-results" - since this file
  // lives in e2e/AmazerTrans rather than the repo root, that default would silently split
  // trace/video/screenshot artifacts into a new e2e/AmazerTrans/test-results folder instead of the
  // repo-root test-results/ that captureScreenshot (utils/screenshot.ts, resolved via
  // process.cwd()) and every existing diagnostic workflow already expect. Pinned back explicitly to
  // preserve that exact behavior.
  outputDir: path.join(__dirname, '..', '..', 'test-results'),
  timeout: 100000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['html'],
    ['list'],
    ['allure-playwright'],
  ],
  use: {
    headless: process.env.HEADLESS !== undefined ? process.env.HEADLESS === 'true' : !!process.env.CI,
    screenshot: 'only-on-failure',
    video: (process.env.VIDEO as 'off' | 'on' | 'retain-on-failure' | 'on-first-retry') || 'retain-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO) || 0,
    },
  },
  projects: [
    // Existing default project - untouched, still the single-account entry point every other
    // AmazerTrans spec (customer/vendor/enquiry/quotation/login/customer-vendor-e2e) uses via
    // `--project=chromium`. Resolves to AmazerTrans's own DEFAULT `userAccount`
    // (utils/userAccountFixture.ts's re-extended default), exactly as before multi-user support
    // existed - completely unaffected by users.config.json.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // One project per ENABLED entry in users.config.json - never a fixed count. Each gets its own
    // isolated browser context automatically (Playwright's default per-test context, not something
    // declared here) and its own `userAccount`, so e.g.
    // `npx playwright test --project=user1 --project=user2 --workers=2` (or any subset/count) runs
    // exactly those users truly in parallel with no shared cookies/localStorage/sessionStorage and
    // no risk of two projects sharing one account. See buildUserProjects.ts for why each project's
    // testMatch is narrowed to that user's configured spec (defaults to users.config.json's
    // `defaultTestMatch`) rather than the whole testDir.
    ...buildUserProjects(usersConfig, FALLBACK_BASE_URL),
  ],
});
