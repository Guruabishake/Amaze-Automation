import { test as base, expect } from '@playwright/test';
import { ResolvedUserAccount } from './types';

/**
 * Generic, suite-agnostic "parameterized projects" fixture
 * (https://playwright.dev/docs/test-parameterize#parameterized-projects): a fixture declared with
 * `{ option: true }` becomes a per-project config value, settable from a project's own `use`
 * block, with no change to the test body. buildUserProjects.ts is what actually sets this value
 * per generated project - this file only declares the fixture and a neutral, empty default (no
 * AmazerTrans-specific data belongs here; a suite that needs its EXISTING default account to keep
 * working for its own unmodified default project should re-extend this fixture with its own
 * default - see e2e/AmazerTrans/utils/userAccountFixture.ts for that exact pattern).
 */
const EMPTY_ACCOUNT: ResolvedUserAccount = {
  id: 'default',
  label: 'DEFAULT',
  username: '',
  password: '',
  branch: '',
  environment: 'default',
  baseUrl: '',
  browser: 'chromium',
};

export const test = base.extend<{ userAccount: ResolvedUserAccount }>({
  userAccount: [EMPTY_ACCOUNT, { option: true }],
});

export { expect };
export type { ResolvedUserAccount };
